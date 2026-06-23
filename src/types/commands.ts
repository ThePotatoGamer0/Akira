import type { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";

export type AkiraCommand = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
};
