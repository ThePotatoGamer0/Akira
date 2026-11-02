import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { DAILY_BITS } from "../../game/balance.js";
import { claimDaily } from "../../game/economy.js";
import type { AkiraCommand } from "../../types/commands.js";
import { queueCooldownReminder } from "../reminder-schedule.js";
import { sendGameError } from "../reply.js";

/** The prestige part of the daily, kept apart from the catch-up so the reply can name it. */
function prestigePart(awarded: number, catchUp: number): number {
  const bonus = awarded - Math.round(DAILY_BITS * catchUp);
  return bonus > 0 ? bonus : 0;
}

export const daily: AkiraCommand = {
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim today's bits"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const result = await claimDaily(interaction.user.id, interaction.user.username);
      void queueCooldownReminder(interaction.user.id, "DAILY");
      const prestige = prestigePart(result.awarded, result.catchUp);
      const extra = prestige > 0 ? `, ${prestige} of it from prestige` : "";
      const catchUp = result.catchUp > 1
        ? ` A small collection earns extra until it has 250 cards or is a month old, so today is ${Math.round(result.catchUp * 100)}%.`
        : "";
      await interaction.reply({
        content: `Akira set aside ${result.awarded} bits${extra} for today.${catchUp} You now have ${result.balance}.`,
        ephemeral: true,
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
