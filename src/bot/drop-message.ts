import fs from "node:fs";
import { AttachmentBuilder } from "discord.js";
import { dropAnnouncement } from "../game/display.js";
import { ensureCardImage, visualKind } from "../game/compose.js";
import type { PresentedSlot } from "../game/drops.js";
import { renderDropStrip } from "../renderer/drop-strip.js";

export async function renderDropMessage(input: {
  dropperDiscordId: string;
  slots: PresentedSlot[];
  wishlistDiscordIds: string[];
}) {
  const cards = await Promise.all(input.slots.map(async (slot) => {
    const kind = visualKind(slot.quality, null);
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
      kind,
    });
    return { image: fs.readFileSync(imagePath), animated: kind === "shiny" };
  }));

  const strip = await renderDropStrip(cards);
  const name = strip.animated ? "drop.gif" : "drop.png";
  return {
    content: dropAnnouncement(input.dropperDiscordId, input.wishlistDiscordIds, input.slots.length),
    embeds: [],
    files: [new AttachmentBuilder(strip.data, { name })],
  };
}
