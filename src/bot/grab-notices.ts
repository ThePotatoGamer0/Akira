import type { Client } from "discord.js";
import { DROP_PROTECTION_MS } from "../game/balance.js";
import { fightOffAnnouncement, grabAnnouncement } from "../game/display.js";
import { dropsNeedingGrabRelease, releaseHeldGrabs, type GrabNotice } from "../game/drops.js";

const timers = new Map<string, NodeJS.Timeout>();

export function grabNoticeText(notice: GrabNotice): string {
  if (notice.foughtOffDiscordId) {
    return fightOffAnnouncement({
      dropperDiscordId: notice.discordId,
      sniperDiscordId: notice.foughtOffDiscordId,
      characterName: notice.characterName,
      cardId: notice.cardId,
      quality: notice.quality,
    });
  }
  return grabAnnouncement({
    discordId: notice.discordId,
    characterName: notice.characterName,
    cardId: notice.cardId,
    quality: notice.quality,
  });
}

async function publish(client: Client, messageId: string, channelId: string): Promise<void> {
  timers.delete(messageId);
  try {
    const released = await releaseHeldGrabs(Date.now(), messageId);
    const batch = released[0];
    if (!batch || batch.notices.length === 0) return;
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) return;
    for (const notice of batch.notices) {
      await channel.send(grabNoticeText(notice));
    }
  } catch (err) {
    console.error(err);
  }
}

/** Grab lines wait until this moment, unless the dropper takes a card sooner. */
export function scheduleGrabNotices(
  client: Client,
  drop: { messageId: string; channelId: string; createdAt: Date },
): void {
  const existing = timers.get(drop.messageId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, drop.createdAt.getTime() + DROP_PROTECTION_MS - Date.now());
  const timer = setTimeout(() => {
    void publish(client, drop.messageId, drop.channelId);
  }, delay);
  timers.set(drop.messageId, timer);
}

export async function resumeGrabNotices(client: Client): Promise<void> {
  const drops = await dropsNeedingGrabRelease();
  for (const drop of drops) scheduleGrabNotices(client, drop);
}
