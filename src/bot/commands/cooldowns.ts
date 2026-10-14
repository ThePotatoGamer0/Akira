import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { cooldownLine } from "../../game/display.js";
import { readTimers } from "../../game/economy.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

export const cooldowns: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("cooldowns")
    .setDescription("See drop, grab, and daily timers")
    .addUserOption((option) => option.setName("user").setDescription("Whose timers to check")),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const target = interaction.options.getUser("user") ?? interaction.user;
    try {
      const timers = await readTimers(target.id);
      const embed = new EmbedBuilder()
        .setTitle("View Cooldowns")
        .setColor("#2b2d31")
        .setDescription(
          [
            `Showing cooldowns for <@${target.id}>`,
            "",
            cooldownLine("Grab", timers.grabMs),
            cooldownLine("Drop", timers.dropMs),
            cooldownLine("Daily", timers.dailyMs),
          ].join("\n"),
        );
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
