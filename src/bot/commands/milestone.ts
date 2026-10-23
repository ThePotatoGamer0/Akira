import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { claimMilestone, economySnapshot } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import { GameError } from "../../game/errors.js";
import { progressBar } from "../../utils/progress-bar.js";
import { iconsAreReady, whenIconsSynced } from "../icon-sync.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

export const milestone: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("milestone")
    .setDescription("See this cycle's bar. The first step is 250 bits, then each step doubles.")
    .addSubcommand((sub) => sub.setName("show").setDescription("List all ten steps, from 250 bits up to 128,000"))
    .addSubcommand((sub) => sub.setName("claim").setDescription("Take the next payout when the bar has reached it")),
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
      if (!iconsAreReady()) await interaction.deferReply({ ephemeral: true });
      await whenIconsSynced();
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      const view = await economySnapshot(user.id, interaction.guildId);
      const rows = view.milestones.map((row) => {
        const mark = row.claimed ? "claimed" : `${row.cost.toLocaleString("en-US")} bits, pays ${row.payout.toLocaleString("en-US")}`;
        const extra = row.prestige ? ` Prestige reward: ${row.prestige}` : "";
        return `${row.step}. ${mark}.${extra}`;
      });
      const upcoming = view.milestones.find((row) => !row.claimed);
      const ratio = upcoming ? view.progress / upcoming.cost : 1;
      const filled = upcoming
        ? `${view.progress.toLocaleString("en-US")} / ${upcoming.cost.toLocaleString("en-US")}`
        : "The bar is full.";
      const left = view.bitsLeft === null ? "This is the last milestone." : `${view.bitsLeft.toLocaleString("en-US")} bits left until the next one.`;
      const keep = view.prestigePreview.keep.length > 0
        ? `Prestiging now would keep: ${view.prestigePreview.keep.join(" ")}`
        : "Prestiging now would keep no permanent buffs.";
      const content = [progressBar(ratio), filled, `You are on step ${view.claimed}. ${left}`, keep, ...rows].join("\n");
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
      else await interaction.reply({ content, ephemeral: true });
    } catch (err) {
      if (err instanceof GameError) {
        const content = err.message;
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => undefined);
        else await interaction.reply({ content, ephemeral: true }).catch(() => undefined);
        return;
      }
      await sendGameError(interaction, err);
    }
  },
};
