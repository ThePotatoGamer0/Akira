import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import type { AkiraCommand } from "../../types/commands.js";
import { stub } from "../voice.js";

function simple(name: string, description: string, feature: string): AkiraCommand {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(description),
    execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
      await interaction.reply({ content: stub(feature), ephemeral: true });
    },
  };
}

export const importCsv = simple("import", "Import cards from a Karuta spreadsheet", "CSV import");
export const dye = simple("dye", "Apply a dye cosmetic to a card", "dyes");
