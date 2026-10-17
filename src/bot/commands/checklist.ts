import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { formatChecklist, setTrackedByName, trackedMissing } from "../../game/checklist.js";
import { ensureUser } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { commandPrefix } from "../prefix.js";
import { sendGameError } from "../reply.js";

export const checklist: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("cc")
    .setDescription("List missing characters in the series you track")
    .addSubcommand((sub) => sub.setName("show").setDescription("List the characters you still don't have"))
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Track a series")
        .addStringOption((option) =>
          option.setName("series").setDescription("Series name. A unique start of the name is enough.").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Stop tracking a series")
        .addStringOption((option) =>
          option.setName("series").setDescription("Series name. A unique start of the name is enough.").setRequired(true),
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const sub = interaction.options.getSubcommand();
    try {
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      if (sub === "add" || sub === "remove") {
        const name = interaction.options.getString("series", true);
        const content = await setTrackedByName(user.id, name, sub === "add");
        await interaction.reply({ content });
        return;
      }
      const rows = await trackedMissing(user.id);
      if (rows.length === 0) {
        await interaction.reply({
          content: `Akira isn't tracking any series yet. \`${commandPrefix()}cc add Demon Slayer\` pins one. The same four series show on the WebUI.`,
        });
        return;
      }
      const pages = formatChecklist(rows);
      await interaction.reply({ content: pages[0] ?? "Akira isn't tracking any series yet." });
      for (const page of pages.slice(1)) {
        await interaction.followUp({ content: page });
      }
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
