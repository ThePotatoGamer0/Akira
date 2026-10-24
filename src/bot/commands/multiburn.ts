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
import { burnTaggedCards, multiburnConfirmText, planTaggedBurn } from "../../game/multiburn.js";
import { GameError } from "../../game/errors.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

const WINDOW_MS = 2 * 60 * 1000;
const EMBED = "#2b2d31";

type PendingBurn = {
  discordId: string;
  tagName: string;
  cardIds: string[];
  guildId: string | null;
  expiresAt: number;
};

const pending = new Map<string, PendingBurn>();

function remember(plan: PendingBurn): string {
  const id = randomBytes(6).toString("hex");
  pending.set(id, plan);
  return id;
}

function confirmPayload(token: string, description: string) {
  const embed = new EmbedBuilder().setTitle("Are you sure?").setColor(EMBED).setDescription(description);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`mburn:yes:${token}`).setLabel("Yes").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mburn:no:${token}`).setLabel("No").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

function burnedLine(result: { burned: number; awarded: number; balance: number; skipped: number; emoji: string; tagName: string }): string {
  const cardWord = result.burned === 1 ? "card" : "cards";
  const main = `Akira burned **${result.burned}** ${cardWord} tagged ${result.emoji} **${result.tagName}** and tucked ${result.awarded} bits away. You now have ${result.balance}.`;
  if (result.skipped === 0) return main;
  const left = result.skipped === 1 ? "1 card was left alone." : `${result.skipped} cards were left alone.`;
  return `${main} ${left}`;
}

export const multiburn: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("multiburn")
    .setDescription("Burn every card on one of your tags")
    .addStringOption((option) => option.setName("tag_name").setDescription("The tag").setRequired(true)),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const plan = await planTaggedBurn(
        interaction.user.id,
        interaction.options.getString("tag_name", true),
        interaction.guildId,
      );
      const token = remember({
        discordId: interaction.user.id,
        tagName: plan.tagName,
        cardIds: plan.cards.map((card) => card.id),
        guildId: interaction.guildId,
        expiresAt: Date.now() + WINDOW_MS,
      });
      await interaction.reply(confirmPayload(token, multiburnConfirmText(plan)));
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handleMultiburnButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = /^mburn:(yes|no):([a-f0-9]+)$/.exec(interaction.customId);
  if (!match) return false;
  const action = match[1]!;
  const token = match[2]!;
  const saved = pending.get(token);
  if (!saved || saved.expiresAt < Date.now()) {
    pending.delete(token);
    await interaction.update({ content: "That burn expired. Run it again.", embeds: [], components: [] });
    return true;
  }
  if (interaction.user.id !== saved.discordId) {
    await interaction.reply({ content: "That confirmation isn't yours.", ephemeral: true });
    return true;
  }
  pending.delete(token);
  if (action === "no") {
    await interaction.update({ content: "Left as it is.", embeds: [], components: [] });
    return true;
  }
  await interaction.deferUpdate();
  try {
    const result = await burnTaggedCards(
      interaction.user.id,
      interaction.user.username,
      saved.tagName,
      saved.cardIds,
      saved.guildId,
    );
    await interaction.editReply({ content: burnedLine(result), embeds: [], components: [] });
  } catch (err) {
    const content = err instanceof GameError
      ? err.message
      : "Akira tripped over something. Mind trying again in a moment?";
    if (!(err instanceof GameError)) console.error(err);
    await interaction.editReply({ content, embeds: [], components: [] });
  }
  return true;
}
