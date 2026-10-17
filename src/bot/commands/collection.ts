import { randomBytes } from "node:crypto";
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
import { displayFrameId, personalDefaultFrame, serverDefaultFrame } from "../../game/frames.js";
import { cardSummaryLine } from "../../game/display.js";
import { GameError } from "../../game/errors.js";
import { packFilterText, parseCardFilters, unpackFilterText, type CardFilter } from "../../game/filters.js";
import { emojiForTag, tagEmojisForDiscord } from "../../game/tags.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";
import { icon } from "../../utils/icons.js";

const remembered = new Map<string, string>();

function filterSuffix(ownerId: string, pages: number, canonical: string): string {
  if (!canonical) return "";
  const packed = packFilterText(canonical);
  const probe = `collection:${ownerId}:first:${Math.max(0, pages - 1)}:${packed}`;
  if (probe.length <= 100) return `:${packed}`;
  let token = "";
  for (const [key, value] of remembered) {
    if (value === canonical) token = key;
  }
  if (!token) {
    token = randomBytes(4).toString("hex");
    remembered.set(token, canonical);
  }
  return `:@${token}`;
}

function collectionButtons(ownerId: string, page: number, total: number, canonical: string) {
  const pages = Math.max(1, Math.ceil(total / COLLECTION_PAGE_SIZE));
  const suffix = filterSuffix(ownerId, pages, canonical);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`collection:${ownerId}:first:0${suffix}`)
      .setEmoji(icon("skip-back"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`collection:${ownerId}:prev:${page - 1}${suffix}`)
      .setEmoji(icon("chevron-left"))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`collection:${ownerId}:next:${page + 1}${suffix}`)
      .setEmoji(icon("chevron-right"))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= pages - 1),
    new ButtonBuilder()
      .setCustomId(`collection:${ownerId}:last:${pages - 1}${suffix}`)
      .setEmoji(icon("skip-forward"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );
  return [row];
}

async function collectionPayload(ownerId: string, page: number, guildId: string | null, filter: CardFilter, filterText: string) {
  const { total, cards, page: safePage, owned } = await listCollection(ownerId, page, filter);
  const serverFrame = await serverDefaultFrame(guildId);
  const personalFrame = await personalDefaultFrame(ownerId);
  const start = total === 0 ? 0 : safePage * COLLECTION_PAGE_SIZE + 1;
  const end = total === 0 ? 0 : safePage * COLLECTION_PAGE_SIZE + cards.length;
  const tags = await tagEmojisForDiscord(ownerId);
  const lines = cards.map((card) =>
    cardSummaryLine({
      cardId: card.id,
      quality: card.quality,
      printNumber: card.printNumber,
      frameId: displayFrameId(card.frameId, serverFrame, personalFrame),
      seriesName: card.variant.character.series.name,
      characterName: card.variant.character.name,
      tagEmoji: emojiForTag(tags, card.tag),
    }),
  );
  const body = total === 0
    ? owned === 0 ? "No cards yet." : "No cards match."
    : `${lines.join("\n")}\n\nShowing cards ${start}-${end} of ${total}`;
  const filterLine = filterText ? `\n\`${filterText}\`` : "";
  const embed = new EmbedBuilder()
    .setTitle("Card Collection")
    .setDescription(`Cards owned by <@${ownerId}>${filterLine}\n\n${body}`)
    .setColor("#2b2d31");
  return {
    embeds: [embed],
    components: total > COLLECTION_PAGE_SIZE ? collectionButtons(ownerId, safePage, total, filterText) : [],
  };
}

function readFilters(raw: string | null): { filter: CardFilter; text: string } {
  const parsed = parseCardFilters(raw ?? "");
  if (!parsed.ok) throw new GameError("filters", parsed.message);
  return { filter: parsed.filter, text: parsed.text };
}

export const collection: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("collection")
    .setDescription("See cards someone owns")
    .addUserOption((option) => option.setName("user").setDescription("Whose cards to look at"))
    .addStringOption((option) =>
      option.setName("filters").setDescription("s: series, c: character, e: edition, t: tag, q: quality, o: # or w"),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const target = interaction.options.getUser("user") ?? interaction.user;
    try {
      const { filter, text } = readFilters(interaction.options.getString("filters"));
      await interaction.reply(await collectionPayload(target.id, 0, interaction.guildId, filter, text));
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

function canonicalFromButton(packed: string | undefined): string | null {
  if (!packed) return "";
  if (packed.startsWith("@")) return remembered.get(packed.slice(1)) ?? null;
  const text = unpackFilterText(packed);
  const parsed = parseCardFilters(text);
  return parsed.ok ? parsed.text : null;
}

export async function handleCollectionButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = /^collection:(\d+):(first|prev|next|last):(-?\d+)(?::([^:]+))?$/.exec(interaction.customId);
  if (!match) return false;
  const ownerId = match[1]!;
  const page = Number(match[3]);
  const filterText = canonicalFromButton(match[4]);
  if (filterText == null) {
    await interaction.update({ content: "That page expired. Open the collection again.", embeds: [], components: [] });
    return true;
  }
  const parsed = parseCardFilters(filterText);
  const filter = parsed.ok ? parsed.filter : {};
  await interaction.update(await collectionPayload(ownerId, page, interaction.guildId, filter, parsed.ok ? parsed.text : ""));
  return true;
}
