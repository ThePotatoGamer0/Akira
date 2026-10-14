import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type GuildMember,
  type Message,
} from "discord.js";
import { prisma } from "../db/client.js";
import { commandPrefix } from "./prefix.js";

const EMBED = "#2b2d31";
const listening = new Set<string>();

export const KARUTA_PREFIXES = ["k!", "k"] as const;

export function guildListensForKaruta(guildId: string | null): boolean {
  return guildId !== null && listening.has(guildId);
}

export async function loadKarutaGuilds(): Promise<void> {
  const rows = await prisma.guildConfig.findMany({
    where: { karutaPrefix: true },
    select: { guildId: true },
  });
  listening.clear();
  for (const row of rows) listening.add(row.guildId);
}

function isAdminMember(member: GuildMember | null): boolean {
  return member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
}

async function messageAdmin(message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  return isAdminMember(member);
}

function confirmPayload(userId: string, enabling: boolean) {
  const embed = new EmbedBuilder().setTitle("Are you sure?").setColor(EMBED);
  const prefix = commandPrefix();
  embed.setDescription(
    enabling
      ? [
          `Enabling this makes Akira listen for \`k\` and \`k!\` as well as \`${prefix}\`.`,
          "",
          "**Ensure Karuta's prefix has been changed before enabling this option.**",
        ].join("\n")
      : `This turns off \`k\` and \`k!\`. Akira will only listen for \`${prefix}\` again.`,
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`karuta:${enabling ? "enable" : "disable"}:${userId}`)
      .setLabel("Yes")
      .setStyle(enabling ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`karuta:cancel:${userId}`).setLabel("No").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export async function handleKarutaOverride(message: Message): Promise<void> {
  if (!message.guildId || !message.channel.isTextBased() || !("send" in message.channel)) return;
  if (!(await messageAdmin(message))) {
    await message.channel.send("Only a server admin can do that.");
    return;
  }
  const row = await prisma.guildConfig.findUnique({
    where: { guildId: message.guildId },
    select: { karutaPrefix: true },
  });
  await message.channel.send(confirmPayload(message.author.id, row?.karutaPrefix !== true));
}

async function setKarutaPrefix(guildId: string, enabled: boolean): Promise<void> {
  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, karutaPrefix: enabled },
    update: { karutaPrefix: enabled },
  });
  if (enabled) listening.add(guildId);
  else listening.delete(guildId);
}

export async function handleKarutaOverrideButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("karuta:")) return false;
  const [, action, userId] = interaction.customId.split(":");
  if (!action || !userId) return false;
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: "That confirmation isn't yours.", ephemeral: true });
    return true;
  }
  if (action === "cancel") {
    await interaction.update({ content: "Left as it is.", embeds: [], components: [] });
    return true;
  }
  if (action !== "enable" && action !== "disable") return false;
  const member = interaction.member;
  const admin = member && "permissions" in member && typeof member.permissions !== "string"
    ? member.permissions.has(PermissionFlagsBits.Administrator)
    : false;
  if (!interaction.guildId || !admin) {
    await interaction.reply({ content: "Only a server admin can do that.", ephemeral: true });
    return true;
  }
  const enabling = action === "enable";
  await setKarutaPrefix(interaction.guildId, enabling);
  const prefix = commandPrefix();
  const embed = new EmbedBuilder().setColor(EMBED).setDescription(
    enabling
      ? `Akira is listening for \`k\` and \`k!\` as well as \`${prefix}\`.`
      : `Akira is only listening for \`${prefix}\` again.`,
  );
  await interaction.update({ content: null, embeds: [embed], components: [] });
  return true;
}
