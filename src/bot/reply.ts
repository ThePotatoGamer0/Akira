import type { ChatInputCommandInteraction } from "discord.js";
import { GameError } from "../game/errors.js";

export async function sendGameError(interaction: ChatInputCommandInteraction, err: unknown): Promise<void> {
  const content = err instanceof GameError
    ? err.message
    : "Akira tripped over something. Mind trying again in a moment?";
  if (!(err instanceof GameError)) console.error(err);
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
    return;
  }
  await interaction.reply({ content, ephemeral: true });
}
