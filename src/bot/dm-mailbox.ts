import type { Client, Message } from "discord.js";
import { prisma } from "../db/client.js";

/** How long a "ready" reminder stays in the DM before Akira deletes it. */
export const REMINDER_DM_TTL_MS = 60 * 60 * 1000;

const DELETE_GAP_MS = 1_200;
const FULL_SWEEP_MS = 6 * 60 * 60 * 1000;
const EXPIRED_SWEEP_MS = 5 * 60 * 1000;

let sweeping = false;
let lastFullSweep = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Remember a DM so the sweeper leaves it alone until this time. */
export async function rememberEphemeralDm(message: Message, expiresAt: Date): Promise<void> {
  await prisma.ephemeralMessage.upsert({
    where: { id: message.id },
    create: { id: message.id, channelId: message.channelId, expiresAt },
    update: { expiresAt },
  });
}

export function startDmCleanup(client: Client): void {
  void sweep(client);
  setInterval(() => void sweep(client), EXPIRED_SWEEP_MS);
}

async function sweep(client: Client): Promise<void> {
  if (sweeping || !client.user) return;
  sweeping = true;
  try {
    await deleteExpired(client);
    if (Date.now() - lastFullSweep >= FULL_SWEEP_MS) {
      await deleteUntracked(client);
      lastFullSweep = Date.now();
    }
  } catch (err) {
    console.error("DM cleanup failed.", err);
  } finally {
    sweeping = false;
  }
}

async function deleteExpired(client: Client): Promise<void> {
  const due = await prisma.ephemeralMessage.findMany({
    where: { expiresAt: { lte: new Date() } },
    take: 40,
  });
  for (const row of due) {
    try {
      const channel = await client.channels.fetch(row.channelId);
      if (channel?.isDMBased()) await channel.messages.delete(row.id);
    } catch {
      /* already gone, or the channel is closed */
    }
    await prisma.ephemeralMessage.delete({ where: { id: row.id } }).catch(() => undefined);
    await sleep(DELETE_GAP_MS);
  }
}

/** Bot DMs with no expiry row are old mail. Delete them slowly. */
async function deleteUntracked(client: Client): Promise<void> {
  const me = client.user;
  if (!me) return;
  const users = await prisma.user.findMany({ select: { discordId: true } });
  for (const user of users) {
    try {
      const discordUser = await client.users.fetch(user.discordId);
      const channel = await discordUser.createDM();
      let before: string | undefined;
      for (let page = 0; page < 4; page++) {
        const batch = before
          ? await channel.messages.fetch({ limit: 50, before })
          : await channel.messages.fetch({ limit: 50 });
        if (batch.size === 0) break;
        for (const message of batch.values()) {
          if (message.author.id !== me.id) continue;
          const row = await prisma.ephemeralMessage.findUnique({ where: { id: message.id } });
          if (row && row.expiresAt.getTime() > Date.now()) continue;
          await message.delete().catch(() => undefined);
          if (row) await prisma.ephemeralMessage.delete({ where: { id: row.id } }).catch(() => undefined);
          await sleep(DELETE_GAP_MS);
        }
        const oldest = batch.last();
        before = oldest?.id;
        if (batch.size < 50) break;
        await sleep(DELETE_GAP_MS);
      }
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
      if (code !== "50007" && code !== "10013") {
        console.error(`Couldn't clean DMs for ${user.discordId}.`, err);
      }
    }
    await sleep(800);
  }
}
