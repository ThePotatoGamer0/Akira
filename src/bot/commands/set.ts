import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { setDropChannel } from "../../game/drops.js";
import type { AkiraCommand } from "../../types/commands.js";
import { commandPrefix } from "../prefix.js";

const DROP_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

async function isAdmin(client: Client, guildId: string, userId: string): Promise<boolean> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    return member.permissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

export const set: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Choose this channel as the place Akira drops cards"),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const prefix = commandPrefix();
    if (!interaction.guildId || !interaction.channelId) {
      await interaction.reply({ content: "Run this in the server channel where Akira should drop cards." });
      return;
    }
    if (!(await isAdmin(client, interaction.guildId, interaction.user.id))) {
      await interaction.reply({ content: `Only a server admin can run \`${prefix}set\`.` });
      return;
    }
    const channel = await client.channels.fetch(interaction.channelId).catch(() => null);
    if (!channel || !DROP_CHANNEL_TYPES.has(channel.type) || !("guild" in channel) || channel.guildId !== interaction.guildId) {
      await interaction.reply({ content: "Akira can only drop cards in a text channel." });
      return;
    }
    const me = channel.guild.members.me ?? (await channel.guild.members.fetchMe());
    const perms = channel.permissionsFor(me);
    const needed = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ReadMessageHistory,
    ];
    if (!perms?.has(needed)) {
      await interaction.reply({
        content: "Akira needs to view this channel, send messages, add reactions, and read history.",
      });
      return;
    }
    await setDropChannel(interaction.guildId, channel.id);
    await interaction.reply({ content: "Akira will drop cards in this channel." });
  },
};
