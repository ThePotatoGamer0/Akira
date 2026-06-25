import fs from "node:fs";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { resolveCardFiles } from "../utils/paths.js";

/**
 * Constructs the Discord message payload (embed + file attachment) for a card.
 * Throws an error if the image file is missing from the disk.
 */
export function buildCardMessage(
  cardId: string,
  discordId: string | null,
  quality: string,
  printNumber: number,
  frameId: number,
  dye: string | null,
  seriesSlug: string,
  seriesName: string,
  characterSlug: string,
  characterName: string,
  characterGender: string | null,
  characterDescription: string | null,
  characterAliases: string | null,
  variantId: string,
  variantName: string
) {
  const paths = resolveCardFiles(seriesSlug, characterSlug, variantId, frameId);
  
  // A card is visually shiny if it has a custom dye applied OR if it is max rarity
  const isShiny = dye !== null || quality === "LEGENDARY";
  const imagePath = isShiny ? paths.shiny : paths.normal;
  const fileName = isShiny ? "card.apng" : "card.png";

  if (!fs.existsSync(imagePath)) {
    throw new Error("IMAGE_MISSING");
  }

  const attachment = new AttachmentBuilder(imagePath, { name: fileName });

  // Parse character aliases array out of the stringified database column safely
  let aliasesList = "";
  if (characterAliases) {
    try {
      const parsed = JSON.parse(characterAliases) as string[];
      if (parsed.length > 0) aliasesList = `\n> *Aliases: ${parsed.join(", ")}*`;
    } catch {
      // Safe fallback if JSON parsing fails
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("Card Details")
    .setDescription(
      (discordId ? `Owned by <@${discordId}>\n\n` : "") +
      `\`${cardId}\` · \`${quality}\` · \`#${printNumber}\` · \`◈${frameId}\` · ${seriesName} · **${characterName}**\n\n` +
      `**Variant:** ${variantName} · **Gender:** ${characterGender ?? "Unknown"} · **Dye:** ${dye ? `\`${dye}\`` : "\`None\`"}\n\n` +
      `> ${characterDescription ?? "No description available."}${aliasesList}`
    )
    .setImage(`attachment://${fileName}`)
    .setColor("#2b2d31");

  return { embeds: [embed], files: [attachment] };
}