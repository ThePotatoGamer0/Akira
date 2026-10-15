import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { claimMilestone, economySnapshot } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import { GameError } from "../../game/errors.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

export const milestone: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("milestone")
    .setDescription("See this cycle's milestone bar")
    .addSubcommand((sub) => sub.setName("show").setDescription("List the ten tiers and where you are"))
    .addSubcommand((sub) => sub.setName("claim").setDescription("Take the next milestone payout")),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === "claim") {
        const claimed = await claimMilestone(interaction.user.id, interaction.user.username);
        await interaction.reply({
          content: `Milestone ${claimed.step} paid ${claimed.payout.toLocaleString("en-US")} bits. You have ${claimed.balance.toLocaleString("en-US")} bits, and ${claimed.progress.toLocaleString("en-US")} left on the bar.`,
        });
        return;
      }
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      const view = await economySnapshot(user.id, interaction.guildId);
      const rows = view.milestones.map((row) => {
        const mark = row.claimed ? "claimed" : `${row.cost.toLocaleString("en-US")} given, pays ${row.payout.toLocaleString("en-US")}`;
        const extra = row.prestige ? ` Prestige reward: ${row.prestige}` : "";
        return `${row.step}. ${mark}.${extra}`;
      });
      const left = view.bitsLeft === null ? "This is the last milestone." : `${view.bitsLeft.toLocaleString("en-US")} bits left until the next one.`;
      const keep = view.prestigePreview.keep.length > 0
        ? `Prestiging now would keep: ${view.prestigePreview.keep.join(" ")}`
        : "Prestiging now would keep no permanent buffs.";
      await interaction.reply({
        content: [`You are on step ${view.claimed}. ${left}`, keep, ...rows].join("\n"),
        ephemeral: true,
      });
    } catch (err) {
      if (err instanceof GameError) {
        await interaction.reply({ content: err.message, ephemeral: true });
        return;
      }
      await sendGameError(interaction, err);
    }
  },
};
