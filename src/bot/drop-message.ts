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
  const cards = [];
  for (const slot of input.slots) {
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
    cards.push({ image: fs.readFileSync(imagePath), animated: kind === "shiny" });
  }

  const strip = await renderDropStrip(cards);
  const name = strip.animated ? "drop.gif" : "drop.png";
  return {
    content: dropAnnouncement(input.dropperDiscordId, input.wishlistDiscordIds),
    embeds: [],
    files: [new AttachmentBuilder(strip.data, { name })],
  };
}
