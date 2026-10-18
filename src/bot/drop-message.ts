import fs from "node:fs";
import { AttachmentBuilder } from "discord.js";
import { dropAnnouncement, processingTimeNote } from "../game/display.js";
import { ensureCardImage, visualKind } from "../game/compose.js";
import type { PresentedSlot } from "../game/drops.js";
import { renderDropStripFromStills } from "../renderer/drop-strip.js";

export async function renderDropStripBuffer(slots: PresentedSlot[]): Promise<{ data: Buffer; animated: boolean }> {
  const cards = await Promise.all(slots.map(async (slot) => {
    const imagePath = await ensureCardImage({
      variantId: slot.variantId,
      seriesSlug: slot.seriesSlug,
      characterSlug: slot.characterSlug,
      imageFile: slot.imageFile,
      characterName: slot.characterName,
      seriesName: slot.seriesName,
      frameId: slot.frameId,
      printNumber: null,
      dye: null,
      kind: "normal",
    });
    return { image: fs.readFileSync(imagePath), shiny: visualKind(slot.quality, null) === "shiny" };
  }));
  return renderDropStripFromStills(cards);
}

export function dropMessageFromStrip(input: {
  dropperDiscordId: string;
  slots: PresentedSlot[];
  wishlistDiscordIds: string[];
  strip: Buffer;
  animated: boolean;
  elapsedMs: number;
}) {
  const name = input.animated ? "drop.gif" : "drop.png";
  const announcement = dropAnnouncement(input.dropperDiscordId, input.wishlistDiscordIds, input.slots.length);
  const timing = input.animated ? `\n${processingTimeNote(input.elapsedMs)}` : "";
  return {
    content: `${announcement}${timing}`,
    embeds: [],
    files: [new AttachmentBuilder(input.strip, { name })],
  };
}

export async function renderDropMessage(input: {
  dropperDiscordId: string;
  slots: PresentedSlot[];
  wishlistDiscordIds: string[];
}) {
  const started = Date.now();
  const strip = await renderDropStripBuffer(input.slots);
  return dropMessageFromStrip({
    dropperDiscordId: input.dropperDiscordId,
    slots: input.slots,
    wishlistDiscordIds: input.wishlistDiscordIds,
    strip: strip.data,
    animated: strip.animated,
    elapsedMs: Date.now() - started,
  });
}
