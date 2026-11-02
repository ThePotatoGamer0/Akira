import type { Client } from "discord.js";
import { buffName, startOfUtcDay } from "../game/buffs.js";
import { rollDuePools, type PoolPollVotes, type PoolRollResult } from "../game/live-buffs.js";
import { resolveDropChannelId } from "../game/drops.js";
import { hostIsInGuild } from "./host-gate.js";
import { forgetPoolPoll, maybeOpenPoolPoll, readPoolPoll } from "./pool-poll.js";

function rollLine(result: PoolRollResult): string {
  if (!result.spent) {
    return `Midnight pool: ${result.pot.toLocaleString("en-US")} bits is still under 500, so the pot stays and no buff was applied.`;
  }
  const names = result.buffs.map(buffName);
  const carried = result.carried > 0 ? ` ${result.carried.toLocaleString("en-US")} bits carry into today.` : "";
  return `Midnight pool: ${result.goal.toLocaleString("en-US")} of ${result.pot.toLocaleString("en-US")} bits went on ${names.join(" and ")}.${carried}`;
}

async function guildsWithHost(client: Client): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const guild of client.guilds.cache.values()) {
    if (await hostIsInGuild(guild)) ids.add(guild.id);
  }
  return ids;
}

async function announceRolls(client: Client): Promise<void> {
  const hosts = await guildsWithHost(client);
  // Votes are read before the roll closes the poll; Discord zeroes the breakdown once it ends.
  const pollFor = async (guildId: string): Promise<PoolPollVotes | null> => {
    if (!hosts.has(guildId)) return null;
    const winners = await readPoolPoll(client, guildId).catch(() => null);
    return winners && winners.length > 0 ? { winners } : null;
  };
  const results = await rollDuePools(new Date(), Math.random, hosts, pollFor);
  for (const result of results) {
    await forgetPoolPoll(result.guildId);
    const channelId = await resolveDropChannelId(result.guildId);
    if (!channelId) continue;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("send" in channel) || typeof channel.send !== "function") continue;
    await channel.send(rollLine(result));
  }
}

/** Opens the poll the moment a gift pushes the pot over 25,000. */
export async function pollAfterGift(client: Client, guildId: string): Promise<void> {
  await maybeOpenPoolPoll(client, guildId).catch((err) => console.error("Pool poll did not open.", err));
}

export function startPoolSchedule(client: Client): void {
  const run = () => {
    void announceRolls(client).catch((err) => console.error("Midnight pool roll failed.", err));
  };
  run();
  const arm = () => {
    const next = startOfUtcDay(new Date()).getTime() + 24 * 60 * 60 * 1000 + 2_000;
    setTimeout(() => {
      run();
      arm();
    }, Math.max(1_000, next - Date.now()));
  };
  arm();
}
