import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { cardSummaryLine } from "../game/display.js";

export function buildCardMessage(input: {
  cardId: string;
  discordId: string | null;
  quality: string;
  printNumber: number;
  frameId: number;
  dye: string | null;
  seriesName: string;
  characterName: string;
  characterGender: string | null;
  characterDescription: string | null;
  characterAliases: string | null;
  variantName: string;
  imagePath: string;
  fileName: string;
  tagEmoji?: string;
}) {
  const attachment = new AttachmentBuilder(input.imagePath, { name: input.fileName });
  const owner = input.discordId ? `Owned by <@${input.discordId}>\n\n` : "";
  const embed = new EmbedBuilder()
    .setTitle("Card Details")
    .setColor("#2b2d31")
    .setDescription(
      owner +
        cardSummaryLine({
          cardId: input.cardId,
          quality: input.quality,
          printNumber: input.printNumber,
          frameId: input.frameId,
          seriesName: input.seriesName,
          characterName: input.characterName,
          ...(input.tagEmoji ? { tagEmoji: input.tagEmoji } : {}),
        }),
    )
    .setImage(`attachment://${input.fileName}`);

  return { embeds: [embed], files: [attachment] };
}
