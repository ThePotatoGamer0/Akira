import { ChannelType, type Client, type Message, type Poll } from "discord.js";
import { prisma } from "../db/client.js";
import { buffName, pollSlots, poolChoices, poolGoal, type BuffKind } from "../game/buffs.js";
import { resolveDropChannelId, resolvePoolChannelId } from "../game/drops.js";
import { pollWinners } from "../game/pool-poll.js";

const POLL_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

type StoredPoll = { channelId: string; messageId: string };

function storedPoll(raw: string | null | undefined): StoredPoll | null {
  if (!raw) return null;
  const [channelId, messageId] = raw.split("/");
  return channelId && messageId ? { channelId, messageId } : null;
}

/**
 * What a server votes on: every buff a tier-4 pot could roll, minus the ones the
 * server already has running, so a vote is not spent on a buff it holds.
 */
export function pollOptions(active: readonly BuffKind[] = []): BuffKind[] {
  const held = active.includes("four_cards")
    ? new Set<BuffKind>(["grab_cooldown", "drop_cooldown", "shiny_luck"])
    : new Set<BuffKind>();
  const options = poolChoices(4).filter((kind) => !held.has(kind));
  if (!active.includes("tracked_pull")) options.push("tracked_pull");
  return options.slice(0, 10);
}

async function sendPoll(client: Client, guildId: string, bits: number, now: Date): Promise<boolean> {
  const today = now.toISOString().slice(0, 10);
  if (pollSlots(poolGoal(bits)) < 1) return false;
  const channelId = (await resolvePoolChannelId(guildId)) ?? (await resolveDropChannelId(guildId));
  if (!channelId) return false;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !POLL_CHANNEL_TYPES.has(channel.type) || !("send" in channel)) return false;
  const slots = pollSlots(poolGoal(bits));
  const message = await channel.send({
    poll: {
      question: {
        text:
          slots >= 2
            ? "Tonight's pot passed 50,000: which two server buffs should it give? The poll closes at midnight UTC."
            : "Tonight's pot passed 25,000: which server buff should it give? The poll closes at midnight UTC.",
      },
      answers: pollOptions().map((kind) => ({ text: buffName(kind).slice(0, 55) })),
      duration: 24,
      allowMultiselect: false,
    },
  });
  await prisma.serverPool.update({
    where: { guildId },
    data: { pollMessage: `${message.channelId}/${message.id}`, pollDay: today },
  });
  return true;
}

/** Opens a poll for a server whose pot just crossed the goal. Safe to call on every gift. */
export async function maybeOpenPoolPoll(client: Client, guildId: string, now = new Date()): Promise<boolean> {
  const pool = await prisma.serverPool.findUnique({ where: { guildId } });
  const today = now.toISOString().slice(0, 10);
  // Yesterday's poll has closed, so today's pot starts clean.
  if (pool?.pollMessage && pool.pollDay !== today) await forgetPoolPoll(guildId);
  if (!pool || pool.pollDay === today) return false;
  return sendPoll(client, guildId, pool.totalBits, now);
}

/** Votes as they stand at the midnight roll. Discord zeroes the counts once a poll ends. */
export async function readPoolPoll(client: Client, guildId: string): Promise<BuffKind[] | null> {
  const pool = await prisma.serverPool.findUnique({ where: { guildId } });
  const stored = storedPoll(pool?.pollMessage);
  if (!stored || !pool) return null;
  const channel = await client.channels.fetch(stored.channelId).catch(() => null);
  if (!channel || !("messages" in channel)) return null;
  const message = (await channel.messages.fetch(stored.messageId).catch(() => null)) as Message | null;
  const poll: Poll | null = message?.poll ?? null;
  if (!poll) return null;
  return pollWinners(
    poll.answers.map((answer) => answer.text ?? ""),
    poll.answers.map((answer) => ({ id: answer.id, text: answer.text ?? "", voteCount: answer.voteCount ?? 0 })),
    pollSlots(poolGoal(pool.totalBits)),
  );
}

/** Clears the stored poll so tomorrow can post a fresh one. */
export async function forgetPoolPoll(guildId: string): Promise<void> {
  await prisma.serverPool.update({ where: { guildId }, data: { pollMessage: null } }).catch(() => undefined);
}
