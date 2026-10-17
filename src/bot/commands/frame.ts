import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import {
  frameIdsOnDisk,
  frameName,
  parseFrameToken,
  personalDefaultFrame,
  serverDefaultFrame,
  setCardFrame,
  setPersonalDefaultFrame,
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
  const listed = frameIdsOnDisk()
    .map((id) => `${frameName(id)} (${id})`)
    .join("\n");
  return [
    "Frames:",
    listed || "none",
    "",
    `An admin sets the server default with \`${prefix}frame default yellow\`.`,
    `\`${prefix}frame personal pink\` is your frame for cards that don't have their own.`,
    `\`${prefix}frame personal clear\` uses the server frame again.`,
    `\`${prefix}frame card <code> pink\` gives one card that frame.`,
    `\`${prefix}frame card <code> clear\` drops that card's own frame.`,
  ].join("\n");
}

export const frame: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("frame")
    .setDescription("Set a card's frame, or this server's default")
    .addSubcommand((sub) => sub.setName("show").setDescription("Show this server's default frame"))
    .addSubcommand((sub) =>
      sub
        .setName("personal")
        .setDescription("Set your frame for cards that don't have their own")
        .addStringOption((option) =>
          option.setName("frame").setDescription("A frame name, a frame number, or clear").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("default")
        .setDescription("Set the frame for cards that don't have their own")
        .addStringOption((option) =>
          option.setName("frame").setDescription("A frame name or number. aframe lists them.").setRequired(true),
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
          option.setName("action").setDescription("A frame name, a frame number, or clear").setRequired(true),
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
        const personal = await personalDefaultFrame(interaction.user.id);
        const yours = personal === null
          ? "You don't have a personal frame, so your cards use the server frame."
          : `Your cards use \`${frameName(personal)}\` unless a card has its own frame.`;
        await interaction.reply({
          content: `Cards without their own frame use \`${frameName(current)}\`.\n${yours}\n\n${usage(prefix)}`,
        });
        return;
      }
      if (sub === "personal") {
        const token = interaction.options.getString("frame", true).trim().toLowerCase();
        if (token === "clear") {
          await setPersonalDefaultFrame(interaction.user.id, interaction.user.username, null);
          await interaction.reply({ content: "Your cards will use this server's frame unless a card has its own." });
          return;
        }
        const frameId = parseFrameToken(token);
        if (frameId === null) {
          await interaction.reply({ content: usage(prefix) });
          return;
        }
        await setPersonalDefaultFrame(interaction.user.id, interaction.user.username, frameId);
        await interaction.reply({
          content: `Your cards now use \`${frameName(frameId)}\` unless a card has its own frame.`,
        });
        return;
      }
      if (sub === "default") {
        if (!(await isAdmin(client, interaction.guildId, interaction.user.id))) {
          await interaction.reply({ content: "Only a server admin can change the default frame." });
          return;
        }
        const frameId = parseFrameToken(interaction.options.getString("frame", true));
        if (frameId === null) {
          await interaction.reply({ content: usage(prefix) });
          return;
        }
        await setServerDefaultFrame(interaction.guildId, frameId);
        await interaction.reply({
          content: `Cards without their own frame now use \`${frameName(frameId)}\`.`,
        });
        return;
      }
      const cardId = interaction.options.getString("card_id", true);
      const action = interaction.options.getString("action", true).trim().toLowerCase();
      if (action === "clear") {
        const id = await setCardFrame(interaction.user.id, cardId, null);
        const personal = await personalDefaultFrame(interaction.user.id);
        const again = personal === null ? "this server's frame" : "your frame";
        await interaction.reply({ content: `\`${id}\` will use ${again} again.` });
        return;
      }
      const frameId = parseFrameToken(action);
      if (frameId === null) {
        await interaction.reply({ content: usage(prefix) });
        return;
      }
      const id = await setCardFrame(interaction.user.id, cardId, frameId);
      await interaction.reply({ content: `\`${id}\` now uses \`${frameName(frameId)}\`.` });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};
