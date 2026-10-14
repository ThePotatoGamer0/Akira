import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { COLLECTION_PAGE_SIZE, listCollection } from "../../game/cards.js";
import { displayFrameId, serverDefaultFrame } from "../../game/frames.js";
import { cardSummaryLine } from "../../game/display.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

function collectionButtons(ownerId: string, page: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / COLLECTION_PAGE_SIZE));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`collection:${ownerId}:first:0`)
      .setEmoji("⏪")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`collection:${ownerId}:prev:${page - 1}`)
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`collection:${ownerId}:next:${page + 1}`)
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= pages - 1),
    new ButtonBuilder()
      .setCustomId(`collection:${ownerId}:last:${pages - 1}`)
      .setEmoji("⏩")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );
  return [row];
}

async function collectionPayload(ownerId: string, page: number, guildId: string | null) {
  const { total, cards, page: safePage } = await listCollection(ownerId, page);
  const serverFrame = await serverDefaultFrame(guildId);
  const start = total === 0 ? 0 : safePage * COLLECTION_PAGE_SIZE + 1;
  const end = total === 0 ? 0 : safePage * COLLECTION_PAGE_SIZE + cards.length;
  const lines = cards.map((card) =>
    cardSummaryLine({
      cardId: card.id,
      quality: card.quality,
      printNumber: card.printNumber,
      frameId: displayFrameId(card.frameId, serverFrame),
      seriesName: card.variant.character.series.name,
      characterName: card.variant.character.name,
    }),
  );
  const body = total === 0
    ? "No cards yet."
    : `${lines.join("\n")}\n\nShowing cards ${start}-${end} of ${total}`;
  const embed = new EmbedBuilder()
    .setTitle("Card Collection")
    .setDescription(`Cards owned by <@${ownerId}>\n\n${body}`)
    .setColor("#2b2d31");
  return {
    embeds: [embed],
    components: total > COLLECTION_PAGE_SIZE ? collectionButtons(ownerId, safePage, total) : [],
  };
}

export const collection: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("collection")
    .setDescription("See cards someone owns")
    .addUserOption((option) => option.setName("user").setDescription("Whose cards to look at")),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const target = interaction.options.getUser("user") ?? interaction.user;
    try {
      await interaction.reply(await collectionPayload(target.id, 0, interaction.guildId));
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handleCollectionButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = /^collection:(\d+):(first|prev|next|last):(-?\d+)$/.exec(interaction.customId);
  if (!match) return false;
  const ownerId = match[1]!;
  const page = Number(match[3]);
  await interaction.update(await collectionPayload(ownerId, page, interaction.guildId));
  return true;
}
