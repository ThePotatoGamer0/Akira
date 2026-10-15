import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { getCard } from "../../game/cards.js";
import { displayFrameId, serverDefaultFrame } from "../../game/frames.js";
import { ensureCardImage, visualKind } from "../../game/compose.js";
import { GameError } from "../../game/errors.js";
import type { AkiraCommand } from "../../types/commands.js";
import { emojiForTag, tagEmojisForDiscord } from "../../game/tags.js";
import { buildCardMessage } from "../card-embed.js";
import { sendGameError } from "../reply.js";

export const view: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("view")
    .setDescription("Inspect a specific card")
    .addStringOption((option) =>
      option.setName("card_id").setDescription("The 7 character card code").setRequired(true),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const cardId = interaction.options.getString("card_id", true);
    try {
      const card = await getCard(cardId);
      if (!card) {
        throw new GameError("missing", `Akira couldn't find a card with the id \`${cardId}\`.`);
      }
      const kind = visualKind(card.quality, card.dye);
      const frameId = displayFrameId(card.frameId, await serverDefaultFrame(interaction.guildId));
      const imageRequest = {
        variantId: card.variant.id,
        seriesSlug: card.variant.character.series.slug,
        characterSlug: card.variant.character.slug,
        imageFile: card.variant.image,
        characterName: card.variant.character.name,
        seriesName: card.variant.character.series.name,
        frameId,
        printNumber: card.printNumber,
        dye: card.dye,
      };
      await ensureCardImage({ ...imageRequest, kind: "normal" });
      const imagePath = await ensureCardImage({ ...imageRequest, kind });
      const fileName = kind === "shiny" ? "card.gif" : "card.png";
      const tags = card.owner ? await tagEmojisForDiscord(card.owner.discordId) : new Map<string, string>();
      await interaction.reply(buildCardMessage({
        cardId: card.id,
        discordId: card.owner?.discordId ?? null,
        quality: card.quality,
        printNumber: card.printNumber,
        frameId,
        dye: card.dye,
        seriesName: card.variant.character.series.name,
        characterName: card.variant.character.name,
        characterGender: card.variant.character.gender,
        characterDescription: card.variant.character.description,
        characterAliases: card.variant.character.aliases,
        variantName: card.variant.name,
        imagePath,
        fileName,
        tagEmoji: emojiForTag(tags, card.tag),
      }));
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
