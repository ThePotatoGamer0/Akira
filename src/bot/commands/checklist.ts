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
import {
  checklistPageBody,
  paginateChecklist,
  setTrackedByName,
  trackedMissing,
} from "../../game/checklist.js";
import { ensureUser, findUserByDiscordId } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { icon } from "../../utils/icons.js";
import { commandPrefix } from "../prefix.js";
import { sendGameError } from "../reply.js";

const EMBED = "#2b2d31";
const NONE_TRACKED = `Akira isn't tracking any series yet. \`${commandPrefix()}cc add Demon Slayer\` pins one. The same four series show on the WebUI.`;

function checklistButtons(ownerId: string, page: number, pages: number) {
  if (pages <= 1) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`cc:${ownerId}:first:0`)
        .setEmoji(icon("skip-back"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`cc:${ownerId}:prev:${page - 1}`)
        .setEmoji(icon("chevron-left"))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`cc:${ownerId}:next:${page + 1}`)
        .setEmoji(icon("chevron-right"))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= pages - 1),
      new ButtonBuilder()
        .setCustomId(`cc:${ownerId}:last:${pages - 1}`)
        .setEmoji(icon("skip-forward"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= pages - 1),
    ),
  ];
}

async function checklistPayload(discordId: string, page: number) {
  const user = await findUserByDiscordId(discordId);
  if (!user) {
    return { content: NONE_TRACKED, embeds: [], components: [] };
  }
  const pages = paginateChecklist(await trackedMissing(user.id));
  if (pages.length === 0) {
    return { content: NONE_TRACKED, embeds: [], components: [] };
  }
  const safe = Math.min(Math.max(0, page), pages.length - 1);
  const current = pages[safe]!;
  const title = current.parts > 1 ? `${current.series} · ${current.part} of ${current.parts}` : current.series;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(EMBED)
    .setDescription(checklistPageBody(current));
  if (pages.length > 1) {
    embed.setFooter({ text: `Page ${safe + 1} of ${pages.length}` });
  }
  return { embeds: [embed], components: checklistButtons(discordId, safe, pages.length) };
}

export const checklist: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("cc")
    .setDescription("List missing characters in the series you track")
    .addSubcommand((sub) => sub.setName("show").setDescription("List the characters you still don't have"))
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Track a series")
        .addStringOption((option) =>
          option.setName("series").setDescription("Series name. A unique start of the name is enough.").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Stop tracking a series")
        .addStringOption((option) =>
          option.setName("series").setDescription("Series name. A unique start of the name is enough.").setRequired(true),
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const sub = interaction.options.getSubcommand();
    try {
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      if (sub === "add" || sub === "remove") {
        const name = interaction.options.getString("series", true);
        const content = await setTrackedByName(user.id, name, sub === "add");
        await interaction.reply({ content });
        return;
      }
      await interaction.reply(await checklistPayload(interaction.user.id, 0));
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handleChecklistButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = /^cc:(\d+):(first|prev|next|last):(-?\d+)$/.exec(interaction.customId);
  if (!match) return false;
  const ownerId = match[1]!;
  const page = Number(match[3]);
  await interaction.update(await checklistPayload(ownerId, page));
  return true;
}
