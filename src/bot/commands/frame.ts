import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import {
  frameIdsOnDisk,
  serverDefaultFrame,
  setCardFrame,
  setServerDefaultFrame,
} from "../../game/frames.js";
import type { AkiraCommand } from "../../types/commands.js";
import { commandPrefix } from "../prefix.js";
import { sendGameError } from "../reply.js";

async function isAdmin(client: Client, guildId: string, userId: string): Promise<boolean> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    return member.permissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

function usage(prefix: string): string {
  return [
    `Frames on disk: ${frameIdsOnDisk().map((id) => `\`${id}\``).join(", ") || "none"}.`,
    `An admin sets the server default with \`${prefix}frame default <id>\`.`,
    `\`${prefix}frame card <code> <id>\` gives one card that frame. \`${prefix}frame card <code> clear\` uses the server frame again.`,
  ].join(" ");
}

export const frame: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("frame")
    .setDescription("Set a card's frame, or this server's default")
    .addSubcommand((sub) => sub.setName("show").setDescription("Show this server's default frame"))
    .addSubcommand((sub) =>
      sub
        .setName("default")
        .setDescription("Set the frame for cards that don't have their own")
        .addIntegerOption((option) =>
          option.setName("frame").setDescription("Frame id").setRequired(true).setMinValue(0),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("card")
        .setDescription("Give one card its own frame, or clear it")
        .addStringOption((option) =>
          option.setName("card_id").setDescription("The 7 character card code").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("action").setDescription("A frame id, or clear").setRequired(true),
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const prefix = commandPrefix();
    const sub = interaction.options.getSubcommand();
    try {
      if (!interaction.guildId) {
        await interaction.reply({ content: "Akira can only change frames in a server." });
        return;
      }
      if (sub === "show") {
        const current = await serverDefaultFrame(interaction.guildId);
        await interaction.reply({
          content: `Cards without their own frame use frame \`${current}\`. ${usage(prefix)}`,
        });
        return;
      }
      if (sub === "default") {
        if (!(await isAdmin(client, interaction.guildId, interaction.user.id))) {
          await interaction.reply({ content: "Only a server admin can change the default frame." });
          return;
        }
        const frameId = interaction.options.getInteger("frame", true);
        await setServerDefaultFrame(interaction.guildId, frameId);
        await interaction.reply({
          content: `Cards without their own frame now use frame \`${frameId}\`.`,
        });
        return;
      }
      const cardId = interaction.options.getString("card_id", true);
      const action = interaction.options.getString("action", true).trim().toLowerCase();
      if (action === "clear") {
        const id = await setCardFrame(interaction.user.id, cardId, null);
        await interaction.reply({ content: `\`${id}\` will use this server's default frame again.` });
        return;
      }
      if (!/^\d+$/.test(action)) {
        await interaction.reply({ content: usage(prefix) });
        return;
      }
      const id = await setCardFrame(interaction.user.id, cardId, Number(action));
      await interaction.reply({ content: `\`${id}\` now uses frame \`${action}\`.` });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
