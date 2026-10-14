import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { DAILY_BITS } from "../../game/balance.js";
import { claimDaily } from "../../game/economy.js";
import type { AkiraCommand } from "../../types/commands.js";
import { queueCooldownReminder } from "../reminder-schedule.js";
import { sendGameError } from "../reply.js";

export const daily: AkiraCommand = {
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim today's bits"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const result = await claimDaily(interaction.user.id, interaction.user.username);
      void queueCooldownReminder(interaction.user.id, "DAILY");
      const bonus = result.awarded - DAILY_BITS;
      const extra = bonus > 0 ? `, plus ${bonus} from prestige` : "";
      await interaction.reply({
        content: `Akira set aside ${DAILY_BITS} bits${extra} for today. You now have ${result.balance}.`,
        ephemeral: true,
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
