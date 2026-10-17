import type { Client } from "discord.js";
import { shopItem, startOfUtcDay } from "../game/buffs.js";
import { rollDuePools, type PoolRollResult } from "../game/live-buffs.js";
import { resolveDropChannelId } from "../game/drops.js";
import { hostIsInGuild } from "./host-gate.js";

function rollLine(result: PoolRollResult): string {
  if (!result.spent) {
    return `Midnight pool: ${result.pot.toLocaleString("en-US")} bits is still under 500, so the pot stays and no buff was applied.`;
  }
  const names = result.buffs.map((kind) => shopItem(kind)?.name ?? kind);
  return `Midnight pool: tier ${result.tier} spent ${result.pot.toLocaleString("en-US")} bits on ${names.join(" and ")}.`;
}

async function guildsWithHost(client: Client): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const guild of client.guilds.cache.values()) {
    if (await hostIsInGuild(guild)) ids.add(guild.id);
  }
  return ids;
}

async function announceRolls(client: Client): Promise<void> {
  const results = await rollDuePools(new Date(), Math.random, await guildsWithHost(client));
  for (const result of results) {
    const channelId = await resolveDropChannelId(result.guildId);
    if (!channelId) continue;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("send" in channel) || typeof channel.send !== "function") continue;
    await channel.send(rollLine(result));
  }
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
