import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { addWishlist, removeWishlist, showWishlist } from "../../game/cards.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

export const wishlist: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("wishlist")
    .setDescription("Watch characters and get a DM when they drop")
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("See a wishlist")
        .addUserOption((option) => option.setName("user").setDescription("Whose wishlist to look at")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Watch a character")
        .addStringOption((option) =>
          option.setName("character").setDescription("Character name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Stop watching a character")
        .addStringOption((option) =>
          option.setName("character").setDescription("Character name").setRequired(true),
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === "add") {
        const name = interaction.options.getString("character", true);
        const character = await addWishlist(interaction.user.id, interaction.user.username, name);
        await interaction.reply({
        content: `Akira will DM you a link when ${character.name} shows up in a drop.`,
          ephemeral: true,
        });
        return;
      }
      if (sub === "remove") {
        const name = interaction.options.getString("character", true);
        const character = await removeWishlist(interaction.user.id, interaction.user.username, name);
        await interaction.reply({
          content: `Akira stopped watching ${character.name}.`,
          ephemeral: true,
        });
        return;
      }
      const target = interaction.options.getUser("user") ?? interaction.user;
      const rows = await showWishlist(target.id);
      if (rows.length === 0) {
        await interaction.reply({
          content: target.id === interaction.user.id
            ? "Akira isn't watching any characters for you yet. Use `/wishlist add`."
            : `Akira isn't watching any characters for <@${target.id}>.`,
          ephemeral: true,
        });
        return;
      }
      const names = rows.map((row) => `${row.character.name} (${row.character.series.name})`).join(", ");
      await interaction.reply({
        content: `Akira is watching these for <@${target.id}>: ${names}.`,
        ephemeral: true,
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
