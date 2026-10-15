import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { GameError } from "../../game/errors.js";
import { economySnapshot, prestigeCycle } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { icon } from "../../utils/icons.js";
import { sendGameError } from "../reply.js";

function prestigeText(waiting: string, keep: string[], canPrestige: boolean): string {
  const kept = keep.length > 0 ? `Prestiging now keeps: ${keep.join(" ")}` : "Prestiging now keeps no permanent buffs.";
  const offer = canPrestige ? "Confirm below to reset the bar and stamp those permanents." : "The confirm button appears once milestone 5 is claimed.";
  return [waiting, kept, offer].join("\n");
}

export const prestige: AkiraCommand = {
  data: new SlashCommandBuilder().setName("prestige").setDescription("Reset the milestone cycle and keep permanents past tier 5"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      const view = await economySnapshot(user.id, interaction.guildId);
      const row = view.prestigePreview.canPrestige
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`prestige:yes:${interaction.user.id}`)
                .setEmoji(icon("check"))
                .setLabel("Prestige")
                .setStyle(ButtonStyle.Success),
            ),
          ]
        : [];
      await interaction.reply({
        content: prestigeText(view.prestigePreview.waiting, view.prestigePreview.keep, view.prestigePreview.canPrestige),
        components: row,
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handlePrestigeButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("prestige:yes:")) return false;
  const ownerId = interaction.customId.split(":")[2];
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This prestige belongs to someone else.", ephemeral: true });
    return true;
  }
  try {
    const result = await prestigeCycle(interaction.user.id, interaction.user.username);
    const kept = result.kept.length > 0 ? result.kept.join(" ") : "No permanent buffs were stamped.";
    await interaction.update({
      content: `Prestige ${result.prestigeLevel}. The bar is back at the 250-bit milestone. ${kept}`,
      components: [],
    });
  } catch (err) {
    if (err instanceof GameError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return true;
    }
    throw err;
  }
  return true;
}
