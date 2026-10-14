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
import { editionCirculation, getLookupCharacter, searchCharacters } from "../../game/cards.js";
import { qualityStars } from "../../game/display.js";
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

function editionOrder<T extends { id: string; name: string }>(variants: T[]): T[] {
  return variants.slice().sort((a, b) => {
    const base = Number(b.id.endsWith("-base")) - Number(a.id.endsWith("-base"));
    if (base !== 0) return base;
    return a.name.localeCompare(b.name);
  });
}

function count(value: number): string {
  return value.toLocaleString("en-GB");
}

type ListedCharacter = Awaited<ReturnType<typeof searchCharacters>>["characters"][number];

function resultsPayload(userId: string, query: string, total: number, characters: ListedCharacter[]) {
  const lines = characters.map((character, index) =>
    `${index + 1}. \`${character._count.wishlists}\` · ${character.series.name} · **${character.name}**`,
  );
  const embed = new EmbedBuilder()
    .setTitle("Character Results")
    .setColor(EMBED)
    .setDescription(
      [
        `<@${userId}>, please select a character using the menu below.`,
        "",
        `Showing characters 1-${characters.length} of ${total}`,
        "",
        lines.join("\n"),
      ].join("\n"),
    );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`lookup:pick:${userId}:${packQuery(query)}`)
    .setPlaceholder("Select a character")
    .addOptions(
      characters.map((character) => ({
        label: character.name.slice(0, 100),
        description: character.series.name.slice(0, 100),
        value: character.id,
      })),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

async function detailPayload(userId: string, query: string, characterId: string, editionIndex: number) {
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
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lookup:back:${userId}:${packed}`)
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lookup:ed:${index - 1}:${character.id}:${userId}:${packed}`)
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(index <= 0),
    new ButtonBuilder()
      .setCustomId(`lookup:ed:${index + 1}:${character.id}:${userId}:${packed}`)
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(index >= editions.length - 1),
  );

  return { content: null, embeds: [embed], components: [row], files };
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
      const { total, characters } = await searchCharacters(name);
      if (total === 0) {
        await interaction.reply({
          content: `Akira couldn't find anything matching "${name.trim()}".`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply(resultsPayload(interaction.user.id, name, total, characters));
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handleLookupSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  const match = /^lookup:pick:(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  if (!match) return false;
  const characterId = interaction.values[0];
  if (!characterId) return true;
  const payload = await detailPayload(match[1]!, unpackQuery(match[2]!), characterId, 0);
  await interaction.update(payload);
  return true;
}

export async function handleLookupButton(interaction: ButtonInteraction): Promise<boolean> {
  const back = /^lookup:back:(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  if (back) {
    const userId = back[1]!;
    const query = unpackQuery(back[2]!);
    const { total, characters } = await searchCharacters(query);
    if (total === 0) {
      await interaction.update({
        content: `Akira couldn't find anything matching "${query}".`,
        embeds: [],
        components: [],
        attachments: [],
      });
      return true;
    }
    await interaction.update({ ...resultsPayload(userId, query, total, characters), attachments: [] });
    return true;
  }

  const edition = /^lookup:ed:(\d+):([a-z0-9]+):(\d+):([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  if (!edition) return false;
  const payload = await detailPayload(edition[3]!, unpackQuery(edition[4]!), edition[2]!, Number(edition[1]));
  await interaction.update(payload);
  return true;
}
