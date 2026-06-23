import { SlashCommandBuilder, type Client, type ChatInputCommandInteraction } from "discord.js";
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

export const drop = simple("drop", "Drop cards in the configured channel", "drops");
export const grab = simple("grab", "React on a drop to claim (via number emoji)", "grab reactions");
export const collection = simple("collection", "Browse cards you own", "collection view");
export const view = simple("view", "Inspect a specific card", "card view");
export const burn = simple("burn", "Destroy a card for bits (shows burn.apng)", "burn");
export const multiburn = simple("multiburn", "Burn many cards with filters", "multiburn");
export const daily = simple("daily", "Claim your daily bits", "daily rewards");
export const cooldowns = simple("cooldowns", "See grab and drop timers", "cooldowns");
export const lookup = simple("lookup", "Search characters in the card pool", "lookup");
export const reminders = simple("reminders", "DM reminders when cooldowns expire", "reminders");
export const importCsv = simple("import", "Import cards from a Karuta k!spreadsheet CSV", "CSV import");
