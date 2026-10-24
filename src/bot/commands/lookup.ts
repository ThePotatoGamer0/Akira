import fs from "node:fs";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type StringSelectMenuInteraction,
} from "discord.js";
import { QUALITIES } from "../../game/balance.js";
import { LOOKUP_PAGE_SIZE, editionCirculation, getLookupCharacter, searchCharacters } from "../../game/cards.js";
import { editionIndexForVariant, editionOrder } from "../../game/editions.js";
import { qualityStars } from "../../game/display.js";
import { icon } from "../../utils/icons.js";
import { variantArtPath } from "../../utils/paths.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

const EMBED = "#2b2d31";

function packQuery(query: string): string {
  return Buffer.from(query.trim().slice(0, 24), "utf8").toString("base64url");
}

function unpackQuery(packed: string): string {
  return Buffer.from(packed, "base64url").toString("utf8");
}

function aliasCount(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export { editionIndexForVariant };

function count(value: number): string {
  return value.toLocaleString("en-GB");
}

type ListedCharacter = Awaited<ReturnType<typeof searchCharacters>>["characters"][number];

function resultsButtons(userId: string, query: string, page: number, total: number) {
  if (total <= LOOKUP_PAGE_SIZE) return [];
  const pages = Math.max(1, Math.ceil(total / LOOKUP_PAGE_SIZE));
  const packed = packQuery(query);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lookup:page:${userId}:first:0:${packed}`)
      .setEmoji(icon("skip-back"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`lookup:page:${userId}:prev:${page - 1}:${packed}`)
      .setEmoji(icon("chevron-left"))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`lookup:page:${userId}:next:${page + 1}:${packed}`)
      .setEmoji(icon("chevron-right"))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= pages - 1),
    new ButtonBuilder()
      .setCustomId(`lookup:page:${userId}:last:${pages - 1}:${packed}`)
      .setEmoji(icon("skip-forward"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );
  return [row];
}

function resultsPayload(userId: string, query: string, total: number, page: number, characters: ListedCharacter[]) {
  const start = page * LOOKUP_PAGE_SIZE;
  const lines = characters.map((character, index) =>
    `${start + index + 1}. \`${character._count.wishlists}\` · ${character.series.name} · **${character.name}**`,
  );
  const embed = new EmbedBuilder()
    .setTitle("Character Results")
    .setColor(EMBED)
    .setDescription(
      [
        `<@${userId}>, please select a character using the menu below.`,
        "",
        `Showing characters ${start + 1}-${start + characters.length} of ${total}`,
        "",
        lines.join("\n"),
      ].join("\n"),
    );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`lookup:pick:${userId}:${page}:${packQuery(query)}`)
    .setPlaceholder("Select a character")
    .addOptions(
      characters.map((character) => ({
        label: character.name.slice(0, 100),
        description: character.series.name.slice(0, 100),
        value: character.id,
      })),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row, ...resultsButtons(userId, query, page, total)] };
}

async function detailPayload(
  userId: string,
  query: string,
  characterId: string,
  editionIndex: number,
  resultsPage: number,
  opts?: { back?: boolean },
) {
  const character = await getLookupCharacter(characterId);
  if (!character) {
    return {
      content: "Akira couldn't find that character anymore.",
      embeds: [],
      components: [],
      files: [],
    };
  }
  const editions = editionOrder(character.variants);
  const index = Math.min(Math.max(0, editionIndex), Math.max(0, editions.length - 1));
  const edition = editions[index];
  if (!edition) {
    return {
      content: "Akira doesn't have an edition for that character.",
      embeds: [],
      components: [],
      files: [],
    };
  }
  const stats = await editionCirculation(edition.id);
  const lines = [
    `**Character** · ${character.name}`,
    `**Series** · ${character.series.name}`,
    `**Wishlisted** · ${count(character._count.wishlists)}`,
    `**Aliases** · ${count(aliasCount(character.aliases))}`,
  ];
  if (edition.name !== character.name) lines.push(`**Edition** · ${edition.name}`);
  lines.push(
    "",
    `**Total generated** · ${count(stats.generated)}`,
    `**In circulation** · ${count(stats.circulation)}`,
    "",
  );
  for (const quality of QUALITIES) {
    lines.push(`**Circulation** (${qualityStars(quality)}) · ${count(stats.byQuality[quality] ?? 0)}`);
  }
  lines.push("", `Showing edition ${index + 1} of ${Math.max(editions.length, 1)}`);

  const embed = new EmbedBuilder()
    .setTitle("Character Lookup")
    .setColor(EMBED)
    .setDescription(lines.join("\n"));

  const art = variantArtPath(character.series.slug, character.slug, edition.image);
  const files = [];
  if (fs.existsSync(art)) {
    files.push(new AttachmentBuilder(art, { name: "edition.png" }));
    embed.setThumbnail("attachment://edition.png");
  }

  const packed = packQuery(query);
  const page = Math.max(0, resultsPage);
  const showBack = opts?.back !== false;
  const backFlag = showBack ? "1" : "0";
  const buttons: ButtonBuilder[] = [];
  if (showBack) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`lookup:back:${userId}:${page}:${packed}`)
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`lookup:ed:${index - 1}:${character.id}:${userId}:${page}:${packed}:${backFlag}`)
      .setEmoji(icon("chevron-left"))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(index <= 0),
    new ButtonBuilder()
      .setCustomId(`lookup:ed:${index + 1}:${character.id}:${userId}:${page}:${packed}:${backFlag}`)
      .setEmoji(icon("chevron-right"))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(index >= editions.length - 1),
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

  return { content: null, embeds: [embed], components: [row], files };
}

/** Character lookup for one edition, the page `alu` opens for the last grab. */
export async function replyCharacterEdition(
  interaction: ChatInputCommandInteraction,
  characterId: string,
  variantId: string,
  query: string,
): Promise<void> {
  const character = await getLookupCharacter(characterId);
  const index = character ? editionIndexForVariant(character.variants, variantId) : 0;
  const payload = await detailPayload(interaction.user.id, query, characterId, index, 0);
  await interaction.reply({
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    ...(payload.content ? { content: payload.content } : {}),
  });
}

export const lookup: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Search the card pool by character or series")
    .addStringOption((option) =>
      option.setName("name").setDescription("Character, series, or alias").setRequired(true),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const name = interaction.options.getString("name", true);
    try {
      const { total, page, characters } = await searchCharacters(name);
      if (total === 0) {
        await interaction.reply({
          content: `Akira couldn't find anything matching "${name.trim()}".`,
          ephemeral: true,
        });
        return;
      }
      if (total === 1 && characters[0]) {
        const payload = await detailPayload(interaction.user.id, name, characters[0].id, 0, 0, { back: false });
        await interaction.reply({
          embeds: payload.embeds,
          components: payload.components,
          files: payload.files,
          ...(payload.content ? { content: payload.content } : {}),
        });
        return;
      }
      await interaction.reply(resultsPayload(interaction.user.id, name, total, page, characters));
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handleLookupSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  const match = /^lookup:pick:(\d+):(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId)
    ?? /^lookup:pick:(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  if (!match) return false;
  const characterId = interaction.values[0];
  if (!characterId) return true;
  const hasPage = match.length === 4;
  const userId = match[1]!;
  const page = hasPage ? Number(match[2]) : 0;
  const packed = hasPage ? match[3]! : match[2]!;
  const payload = await detailPayload(userId, unpackQuery(packed), characterId, 0, page);
  await interaction.update(payload);
  return true;
}

async function showResults(userId: string, query: string, page: number) {
  const found = await searchCharacters(query, page);
  if (found.total === 0) {
    return {
      content: `Akira couldn't find anything matching "${query}".`,
      embeds: [],
      components: [],
      attachments: [],
    };
  }
  return { ...resultsPayload(userId, query, found.total, found.page, found.characters), attachments: [] };
}

export async function handleLookupButton(interaction: ButtonInteraction): Promise<boolean> {
  const pageButton = /^lookup:page:(\d+):(first|prev|next|last):(-?\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  const oldPageButton = pageButton ? null : /^lookup:page:(\d+):(-?\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  if (pageButton) {
    await interaction.update(await showResults(pageButton[1]!, unpackQuery(pageButton[4]!), Number(pageButton[3])));
    return true;
  }
  if (oldPageButton) {
    await interaction.update(await showResults(oldPageButton[1]!, unpackQuery(oldPageButton[3]!), Number(oldPageButton[2])));
    return true;
  }

  const back = /^lookup:back:(\d+):(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId)
    ?? /^lookup:back:(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  if (back) {
    const hasPage = back.length === 4;
    const userId = back[1]!;
    const page = hasPage ? Number(back[2]) : 0;
    const packed = hasPage ? back[3]! : back[2]!;
    await interaction.update(await showResults(userId, unpackQuery(packed), page));
    return true;
  }

  const edition = /^lookup:ed:(-?\d+):([a-z0-9]+):(\d+):(\d+):([A-Za-z0-9_-]+):([01])$/.exec(interaction.customId)
    ?? /^lookup:ed:(-?\d+):([a-z0-9]+):(\d+):(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId)
    ?? /^lookup:ed:(-?\d+):([a-z0-9]+):(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  if (!edition) return false;
  const hasBackFlag = edition.length === 7;
  const hasPage = hasBackFlag || edition.length === 6;
  const resultsPage = hasPage ? Number(edition[4]) : 0;
  const packed = hasPage ? edition[5]! : edition[4]!;
  const showBack = hasBackFlag ? edition[6] === "1" : true;
  const payload = await detailPayload(
    edition[3]!,
    unpackQuery(packed),
    edition[2]!,
    Number(edition[1]),
    resultsPage,
    { back: showBack },
  );
  await interaction.update(payload);
  return true;
}
