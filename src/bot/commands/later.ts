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

export const multiburn = simple("multiburn", "Burn many cards with filters", "multiburn");
export const importCsv = simple("import", "Import cards from a Karuta spreadsheet", "CSV import");
export const tags = simple("tags", "Organise, tag, or nickname cards", "tags and aliases");
export const give = simple("give", "Give a card to another player", "give");
export const trade = simple("trade", "Trade cards with another player", "trading");
export const shop = simple("shop", "Spend bits on personal buffs", "shop");
export const pool = simple("pool", "See the daily server buff pool", "server pool");
export const dye = simple("dye", "Apply a dye cosmetic to a card", "dyes");
export const inventory = simple("inventory", "View owned items and buffs", "inventory");
