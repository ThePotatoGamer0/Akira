import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
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
    .setDescription("See this cycle's bar. The first stage is 250 bits, then each stage doubles.")
    .addSubcommand((sub) => sub.setName("show").setDescription("List all ten stages, from 250 bits up to 128,000"))
    .addSubcommand((sub) => sub.setName("claim").setDescription("Take the next payout when the bar has reached it")),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === "claim") {
        const claimed = await claimMilestone(interaction.user.id, interaction.user.username);
        await interaction.reply({
          content: `Stage ${claimed.step} paid ${claimed.payout.toLocaleString("en-US")} bits. You have ${claimed.balance.toLocaleString("en-US")} bits, and ${claimed.progress.toLocaleString("en-US")} left on the bar.`,
        });
        return;
      }
      if (!iconsAreReady()) await interaction.deferReply();
      await whenIconsSynced();
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      const view = await economySnapshot(user.id, interaction.guildId);
      const upcoming = view.milestones.find((row) => !row.claimed);
      const ratio = upcoming ? view.progress / upcoming.cost : 1;
      const filled = upcoming
        ? `${view.progress.toLocaleString("en-US")} / ${upcoming.cost.toLocaleString("en-US")}`
        : "The bar is full.";
      const step = upcoming ? upcoming.step : view.claimed;
      const left = view.bitsLeft === null
        ? "This is the last stage."
        : `${view.bitsLeft.toLocaleString("en-US")} bits left until you reach the next stage.`;
      const keep = view.prestigePreview.keep.length > 0
        ? `Prestiging now would keep: ${view.prestigePreview.keep.join(" ")}`
        : "Prestiging now would keep no permanent buffs.";
      const rows = view.milestones.map((row) => {
        const mark = row.claimed
          ? "Claimed"
          : `${row.cost.toLocaleString("en-US")} bits, pays ${row.payout.toLocaleString("en-US")}`;
        const head = `**Stage ${row.step}** · ${mark}`;
        return row.prestige ? `${head}\n${row.prestige}` : head;
      });
      const embed = new EmbedBuilder()
        .setTitle("Milestones")
        .setColor("#2b2d31")
        .setDescription(
          [
            `<@${interaction.user.id}>`,
            "",
            progressBar(ratio),
            filled,
            `You are on stage ${step}. ${left}`,
            keep,
            "",
            ...rows,
          ].join("\n"),
        );
      const payload = { embeds: [embed] };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
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
