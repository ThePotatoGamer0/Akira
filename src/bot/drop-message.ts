import fs from "node:fs";
import { AttachmentBuilder } from "discord.js";
import { dropAnnouncement, processingTimeNote } from "../game/display.js";
import { ensureCardImage, visualKind } from "../game/compose.js";
import type { PresentedSlot } from "../game/drops.js";
import { renderDropStripFromStills } from "../renderer/drop-strip.js";

export async function renderDropMessage(input: {
  dropperDiscordId: string;
  slots: PresentedSlot[];
  wishlistDiscordIds: string[];
}) {
  const started = Date.now();
  const cards = await Promise.all(input.slots.map(async (slot) => {
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

  const strip = await renderDropStripFromStills(cards);
  const name = strip.animated ? "drop.gif" : "drop.png";
  const announcement = dropAnnouncement(input.dropperDiscordId, input.wishlistDiscordIds, input.slots.length);
  const timing = strip.animated ? `\n${processingTimeNote(Date.now() - started)}` : "";
  return {
    content: `${announcement}${timing}`,
    embeds: [],
    files: [new AttachmentBuilder(strip.data, { name })],
  };
}
