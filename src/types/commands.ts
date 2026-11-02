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
  /**
   * How long one player waits before running this command again. A throttled command is dropped
   * without a reply, so spam has nothing to react to. Defaults to `DEFAULT_RATE_LIMIT_MS`; null is unlimited.
   */
  rateLimitMs?: number | null;
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
};
