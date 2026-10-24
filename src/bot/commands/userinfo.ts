import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { playerSummary } from "../../game/cards.js";
import { akiraAddressName } from "../../utils/akira-address-name.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

function count(value: number): string {
  return value.toLocaleString("en-US");
}

export const userinfo: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("See bits, cards, and prestige")
    .addUserOption((option) => option.setName("user").setDescription("Whose profile to look at")),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const target = interaction.options.getUser("user") ?? interaction.user;
    try {
      const summary = await playerSummary(target.id);
      if (!summary) {
        await interaction.reply({
          content: `Akira hasn't met <@${target.id}> yet.`,
          ephemeral: true,
        });
        return;
      }
      const name = akiraAddressName(summary.user);
      const embed = new EmbedBuilder()
        .setTitle("User Info")
        .setColor("#2b2d31")
        .setDescription(
          [
            `**${name}** · <@${target.id}>`,
            "",
            `**Bits** · ${count(summary.user.bits)}`,
            `**Cards** · ${count(summary.cards)}`,
            `**Prestige** · ${count(summary.user.prestigeLevel)}`,
            `**Stages this cycle** · ${count(summary.user.milestoneCount)}`,
            `**Bits given this cycle** · ${count(summary.user.milestoneProgress)}`,
            `**Daily bonus** · ${count(summary.user.passiveBitsBonus)}`,
          ].join("\n"),
        );
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
