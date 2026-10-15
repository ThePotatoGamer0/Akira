import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { GameError } from "../../game/errors.js";
import { economySnapshot, giveToPool } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

function poolText(view: Awaited<ReturnType<typeof economySnapshot>>): string {
  const choices = view.pool.choices.length > 0 ? view.pool.choices.join(", ") : "none until the pot reaches 500 bits";
  const live = view.pool.live.length > 0 ? `${view.pool.live.join(", ")} until ${view.pool.buffExpiry?.replace("T", " ").slice(0, 16)} UTC` : "none";
  return [
    `Pot: ${view.pool.totalBits.toLocaleString("en-US")} bits`,
    `Tier: ${view.pool.tier}`,
    `Can be chosen tonight: ${choices}`,
    `Live: ${live}`,
    `Give bits with \`/pool give\`. That also fills your milestone bar.`,
  ].join("\n");
}

export const pool: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("pool")
    .setDescription("See the server pot or give bits toward tonight's buff")
    .addSubcommand((sub) => sub.setName("show").setDescription("See the pot, the tier, and the live buffs"))
    .addSubcommand((sub) =>
      sub
        .setName("give")
        .setDescription("Move bits into the pot and your milestone bar")
        .addIntegerOption((option) =>
          option.setName("bits").setDescription("How many bits to give").setRequired(true).setMinValue(1),
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Akira only keeps a server pool inside a server.", ephemeral: true });
      return;
    }
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === "give") {
        const bits = interaction.options.getInteger("bits", true);
        const given = await giveToPool(interaction.user.id, interaction.user.username, interaction.guildId, bits);
        await interaction.reply({
          content: `You gave ${bits.toLocaleString("en-US")} bits. The pot is ${given.poolTotal.toLocaleString("en-US")}, and your milestone bar is at ${given.progress.toLocaleString("en-US")}.`,
        });
        return;
      }
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      const view = await economySnapshot(user.id, interaction.guildId);
      await interaction.reply({ content: poolText(view) });
    } catch (err) {
      if (err instanceof GameError) {
        await interaction.reply({ content: err.message, ephemeral: true });
        return;
      }
      await sendGameError(interaction, err);
    }
  },
};
