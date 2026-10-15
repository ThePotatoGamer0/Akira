import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { playerSummary } from "../../game/cards.js";
import { akiraAddressName } from "../../utils/akira-address-name.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

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
      await interaction.reply({
        content: [
          `**${name}**`,
          `Bits: ${summary.user.bits}`,
          `Cards: ${summary.cards}`,
          `Prestige: ${summary.user.prestigeLevel}`,
          `Milestones this cycle: ${summary.user.milestoneCount}`,
          `Bits given this cycle: ${summary.user.milestoneProgress}`,
          `Daily bonus: ${summary.user.passiveBitsBonus}`,
        ].join("\n"),
        ephemeral: true,
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
