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

export const tags = simple("tags", "Organise, tag, or nickname cards", "tags and aliases");
export const wishlist = simple("wishlist", "Wishlist characters (unlimited)", "wishlist");
export const give = simple("give", "Give a card to another player", "give");
export const trade = simple("trade", "Trade cards with another player", "trading");
export const userinfo = simple("userinfo", "Player stats and profile", "user profile");
