import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { claimOutage } from "../../game/outage.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

export const compensate: AkiraCommand = {
  data: new SlashCommandBuilder().setName("compensate").setDescription("Claim bits if Akira was down"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const result = await claimOutage(interaction.user.id, interaction.user.username);
      await interaction.reply({
        content: `Akira set aside ${result.awarded.toLocaleString("en-US")} bits for the time she was down. You now have ${result.balance.toLocaleString("en-US")}.`,
        ephemeral: true,
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
