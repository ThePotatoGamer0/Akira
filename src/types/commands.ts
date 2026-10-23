import type {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export type AkiraCommand = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  /** Left out of Discord's slash list. Prefix text still reaches execute. */
  hidden?: boolean;
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
};
