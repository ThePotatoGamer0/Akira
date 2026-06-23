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

export const shop = simple("shop", "Spend bits on personal buffs", "shop");
export const pool = simple("pool", "Contribute bits to the daily server buff pool", "server pool");
export const dye = simple("dye", "Apply a dye cosmetic to a card", "dyes");
export const frameCmd = simple("frame", "Apply a frame cosmetic to a card", "frames");
export const inventory = simple("inventory", "View owned items and buffs", "inventory");
