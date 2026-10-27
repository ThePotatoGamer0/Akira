import type { Client } from "discord.js";
import { wishlistClaimedLine, wishlistDropDm, wishlistReceipt } from "../game/display.js";
import { wishlistHeadsUps, type WishlistWatcher } from "../game/drops.js";

function mergeHeadsUps(
  watchers: WishlistWatcher[],
  headsUps: Awaited<ReturnType<typeof wishlistHeadsUps>>,
): Map<string, { names: string[]; grabbedBy: Array<string | null> }> {
  const merged = new Map(headsUps.map((headsUp) => [headsUp.discordId, headsUp]));
  for (const watcher of watchers) {
    if (merged.has(watcher.discordId)) continue;
    merged.set(watcher.discordId, {
      discordId: watcher.discordId,
      names: watcher.names,
      grabbedBy: watcher.names.map(() => null),
    });
  }
  return merged;
}

/** A DM for each watcher of this drop: the jump link, then a line for anyone who beat them to it. */
export async function sendWishlistDropDms(
  client: Client,
  watchers: WishlistWatcher[],
  jumpUrl: string,
  messageId: string,
  exceptDiscordId?: string,
): Promise<void> {
  if (watchers.length === 0) return;
  let headsUps: Awaited<ReturnType<typeof wishlistHeadsUps>> = [];
  try {
    headsUps = await wishlistHeadsUps(messageId, exceptDiscordId);
  } catch {
    /* fall back to watchers Akira found at drop time */
  }
  const merged = mergeHeadsUps(watchers, headsUps);
  if (merged.size === 0) return;
  await Promise.all(
    [...merged.entries()].map(async ([discordId, headsUp]) => {
      try {
        const user = await client.users.fetch(discordId);
        const lines = [wishlistDropDm(headsUp.names, jumpUrl)];
        headsUp.names.forEach((name, index) => {
          const grabber = headsUp.grabbedBy[index];
          if (grabber && grabber !== discordId) {
            lines.push(wishlistClaimedLine({ name, grabberDiscordId: grabber, jumpUrl }));
          }
        });
        await user.send(lines.join("\n"));
      } catch {
        /* closed DMs */
      }
    }),
  );
}

export async function sendWishlistReceipt(client: Client, discordId: string, names: string[]): Promise<void> {
  if (names.length === 0) return;
  try {
    const user = await client.users.fetch(discordId);
    await user.send(wishlistReceipt(names));
  } catch {
    /* closed DMs */
  }
}
