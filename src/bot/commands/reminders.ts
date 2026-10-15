import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import {
  listReminders,
  parseReminderAction,
  reminderLabel,
  reminderLine,
  toggleReminder,
  unknownReminder,
} from "../../game/reminders.js";
import type { AkiraCommand } from "../../types/commands.js";
import { queueCooldownReminder } from "../reminder-schedule.js";
import { sendGameError } from "../reply.js";

const TYPE_OF = { daily: "DAILY", drop: "DROP", grab: "GRAB" } as const;

function reminderEmbed(rows: Awaited<ReturnType<typeof listReminders>>) {
  return new EmbedBuilder()
    .setTitle("Reminders")
    .setColor("#2b2d31")
    .setDescription(rows.map((row) => reminderLine(row.action, row.enabled, row.remainingMs)).join("\n"));
}

export const reminders: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("reminders")
    .setDescription("Toggle a ping when a cooldown ends")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Cooldown to toggle")
        .addChoices(
          { name: "daily", value: "daily" },
          { name: "drop", value: "drop" },
          { name: "grab", value: "grab" },
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const raw = interaction.options.getString("action");
    try {
      if (!raw) {
        const rows = await listReminders(interaction.user.id);
        await interaction.reply({ embeds: [reminderEmbed(rows)] });
        return;
      }
      const action = parseReminderAction(raw);
      if (!action) throw unknownReminder(raw);
      const toggled = await toggleReminder(interaction.user.id, interaction.user.username, action);
      await queueCooldownReminder(interaction.user.id, TYPE_OF[action]);
      const rows = await listReminders(interaction.user.id);
      const label = reminderLabel(action).toLowerCase();
      const content = toggled.enabled
        ? `Akira will ping you when **${label}** is ready.`
        : `Akira will stop pinging you when **${label}** is ready.`;
      await interaction.reply({ content, embeds: [reminderEmbed(rows)] });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
