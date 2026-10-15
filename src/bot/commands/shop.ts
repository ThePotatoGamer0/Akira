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
import { SHOP_ITEMS } from "../../game/buffs.js";
import { GameError } from "../../game/errors.js";
import { buyShopBuff, featuredSeries, shopExplanation } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { icon } from "../../utils/icons.js";
import { sendGameError } from "../reply.js";

function pageEmbed(page: number, bits: number, featuredName: string | null, note?: string) {
  const item = SHOP_ITEMS[page] ?? SHOP_ITEMS[0]!;
  const lines = [
    shopExplanation(item.id, featuredName),
    `Price: ${item.priceBits.toLocaleString("en-US")} bits`,
    `Lasts: ${item.durationHours} hours`,
    `You have ${bits.toLocaleString("en-US")} bits.`,
  ];
  if (note) lines.push(note);
  return new EmbedBuilder().setTitle(item.name).setDescription(lines.join("\n"));
}

function shopRow(page: number, ownerId: string) {
  const last = SHOP_ITEMS.length - 1;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop:p:${page}:${ownerId}`)
      .setEmoji(icon("chevron-left"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`shop:n:${page}:${ownerId}`)
      .setEmoji(icon("chevron-right"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= last),
    new ButtonBuilder()
      .setCustomId(`shop:b:${page}:${ownerId}`)
      .setLabel("Buy")
      .setEmoji(icon("check"))
      .setStyle(ButtonStyle.Success),
  );
}

async function render(page: number, discordId: string, username: string, note?: string) {
  const user = await ensureUser(discordId, username);
  const featured = await featuredSeries();
  const safe = Math.min(Math.max(page, 0), SHOP_ITEMS.length - 1);
  return {
    embeds: [pageEmbed(safe, user.bits, featured?.name ?? null, note)],
    components: [shopRow(safe, discordId)],
  };
}

export const shop: AkiraCommand = {
  data: new SlashCommandBuilder().setName("shop").setDescription("Spend bits on a personal buff"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const view = await render(0, interaction.user.id, interaction.user.username);
      await interaction.reply(view);
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handleShopButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("shop:")) return false;
  const [, action, pageText, ownerId] = interaction.customId.split(":");
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This shop belongs to someone else.", ephemeral: true });
    return true;
  }
  const page = Number(pageText);
  if (!Number.isInteger(page)) return true;
  try {
    if (action === "b") {
      const item = SHOP_ITEMS[page];
      if (!item) return true;
      const bought = await buyShopBuff(interaction.user.id, interaction.user.username, item.id);
      const until = bought.expiresAt.toISOString().replace("T", " ").slice(0, 16);
      const note = bought.seriesName
        ? `Bought. ${bought.seriesName} stays locked until ${until} UTC.`
        : `Bought. It lasts until ${until} UTC.`;
      const view = await render(page, interaction.user.id, interaction.user.username, note);
      await interaction.update(view);
      return true;
    }
    const next = action === "n" ? page + 1 : page - 1;
    const view = await render(next, interaction.user.id, interaction.user.username);
    await interaction.update(view);
  } catch (err) {
    if (err instanceof GameError) {
      const view = await render(page, interaction.user.id, interaction.user.username, err.message);
      await interaction.update(view);
      return true;
    }
    throw err;
  }
  return true;
}
