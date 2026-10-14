import type { Client, TextBasedChannel } from "discord.js";
import { DROP_EXPIRED_LINE } from "../game/display.js";
import { dropsAwaitingExpiry, markDropExpired } from "../game/drops.js";

const timers = new Map<string, NodeJS.Timeout>();

function isMissing(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err.code === 10003 || err.code === 10008);
}

async function publishExpiry(client: Client, messageId: string, channelId: string): Promise<void> {
  timers.delete(messageId);
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      await markDropExpired(messageId);
      return;
    }
    const message = await (channel as TextBasedChannel).messages.fetch(messageId);
    if (!message.content.includes("can no longer be grabbed")) {
      const content = message.content ? `${message.content}\n\n${DROP_EXPIRED_LINE}` : DROP_EXPIRED_LINE;
      await message.edit({ content });
    }
    await markDropExpired(messageId);
  } catch (err) {
    if (isMissing(err)) {
      await markDropExpired(messageId);
      return;
    }
    console.error(err);
  }
}

export function scheduleDropExpiry(
  client: Client,
  drop: { messageId: string; channelId: string; expiresAt: Date },
): void {
  const existing = timers.get(drop.messageId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, drop.expiresAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    void publishExpiry(client, drop.messageId, drop.channelId);
  }, delay);
  timers.set(drop.messageId, timer);
}

export async function resumeDropExpiries(client: Client): Promise<void> {
  const drops = await dropsAwaitingExpiry();
  for (const drop of drops) scheduleDropExpiry(client, drop);
}
