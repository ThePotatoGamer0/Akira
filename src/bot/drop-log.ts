import type { Client, GuildMember, Message, PartialMessage } from "discord.js";
import { resolveDropChannelId } from "../game/drops.js";
import { readSpeakerMark } from "./website-message.js";

/**
 * Read the drop channel into the JSON shape `discord-log-html` renders.
 * The module lives in modules/discord-log-html and does not import discord.js.
 */
function configuredGuildId(client: Client): string | null {
  const env = process.env["DISCORD_GUILD_ID"] ?? process.env["AKIRA_GUILD_ID"] ?? "";
  if (env) return env;
  if (client.guilds.cache.size === 1) return client.guilds.cache.first()?.id ?? null;
  return null;
}

function userOf(
  user: { id: string; username: string; globalName: string | null; discriminator: string; avatar: string | null; bot: boolean },
  person = false,
) {
  return {
    id: user.id,
    username: user.username,
    global_name: user.globalName,
    discriminator: user.discriminator,
    avatar: user.avatar,
    bot: person ? undefined : user.bot || undefined,
  };
}

function memberOf(member: GuildMember) {
  return {
    id: member.id,
    display: member.displayName,
    roles: [...member.roles.cache.keys()],
  };
}

function incomingWebhook(message: Message): boolean {
  return Boolean(message.webhookId) && message.applicationId == null;
}

function serialize(message: Message) {
  const spoken = readSpeakerMark(message.content);
  const person = incomingWebhook(message);
  const raw = {
    id: message.id,
    type: message.type,
    content: spoken.text,
    timestamp: message.createdAt.toISOString(),
    edited_timestamp: message.editedAt ? message.editedAt.toISOString() : null,
    flags: message.flags.bitfield,
    author: userOf(message.author, person),
    member: message.member
      ? { nick: message.member.nickname, roles: [...message.member.roles.cache.keys()] }
      : undefined,
    mentions: [...message.mentions.users.values()].map((user) => userOf(user)),
    mention_roles: [...message.mentions.roles.keys()],
    attachments: [...message.attachments.values()].map((file) => ({
      id: file.id,
      filename: file.name,
      size: file.size,
      url: file.url,
      proxy_url: file.proxyURL,
      content_type: file.contentType,
      width: file.width,
      height: file.height,
      spoiler: file.spoiler,
    })),
    embeds: message.embeds.map((embed) => embed.toJSON()),
    reactions: [...message.reactions.cache.values()].map((reaction) => ({
      count: reaction.count,
      emoji: {
        id: reaction.emoji.id,
        name: reaction.emoji.name,
        animated: reaction.emoji.animated ?? false,
      },
    })),
    sticker_items: [...message.stickers.values()].map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      format_type: sticker.format,
      url: sticker.url,
    })),
    components: message.components.map((row) => row.toJSON()),
    message_reference: message.reference?.messageId ? { message_id: message.reference.messageId } : undefined,
  };
  return raw;
}

/** Website posts carry the player's id in a hidden mark. Show that person, not the webhook. */
async function presentMessage(message: Message) {
  const raw = serialize(message);
  const mark = readSpeakerMark(message.content);
  let speaker: ReturnType<typeof memberOf> | null = null;
  if (incomingWebhook(message) && mark.discordId && message.guild) {
    const user = await message.client.users.fetch(mark.discordId).catch(() => null);
    if (user) {
      raw.author = userOf(user, true);
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        raw.member = { nick: member.nickname, roles: [...member.roles.cache.keys()] };
        speaker = memberOf(member);
      }
    }
  }
  return { raw, speaker };
}

export async function readDropChannelLog(client: Client, query?: { before?: string }) {
  const guildId = configuredGuildId(client);
  if (!guildId) return null;
  const channelId = await resolveDropChannelId(guildId);
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return null;

  const before = query?.before && /^\d{17,22}$/.test(query.before) ? query.before : undefined;
  const fetched = await channel.messages.fetch({ limit: 50, ...(before ? { before } : {}) });
  const ordered = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const byId = new Map(ordered.map((message) => [message.id, message]));
  const extras = new Map<string, Message>();
  await Promise.all(
    ordered.map(async (message) => {
      const referencedId = message.reference?.messageId;
      if (!referencedId || byId.has(referencedId) || extras.has(referencedId)) return;
      try {
        extras.set(referencedId, await message.fetchReference());
      } catch {
        /* The message it replies to is gone. */
      }
    }),
  );

  const serialized = new Map<string, Awaited<ReturnType<typeof presentMessage>>["raw"]>();
  const speakers = new Map<string, ReturnType<typeof memberOf>>();
  for (const message of [...ordered, ...extras.values()]) {
    const presented = await presentMessage(message);
    serialized.set(message.id, presented.raw);
    if (presented.speaker) speakers.set(presented.speaker.id, presented.speaker);
  }

  const messages = ordered.map((message) => {
    const raw = serialized.get(message.id);
    if (!raw) return null;
    const referencedId = message.reference?.messageId;
    if (!referencedId) return raw;
    const referenced = serialized.get(referencedId);
    if (!referenced) return raw;
    return { ...raw, referenced_message: { ...referenced, referenced_message: undefined } };
  }).filter((message) => message !== null);

  const members = new Map<string, ReturnType<typeof memberOf>>(speakers);
  const channels = new Map<string, string>();
  for (const message of [...ordered, ...extras.values()]) {
    if (message.member) members.set(message.member.id, memberOf(message.member));
    const mentioned = message.mentions.members;
    if (mentioned) {
      for (const member of mentioned.values()) members.set(member.id, memberOf(member));
    }
    for (const mentionedChannel of message.mentions.channels.values()) {
      if ("name" in mentionedChannel && typeof mentionedChannel.name === "string") {
        channels.set(mentionedChannel.id, mentionedChannel.name);
      }
    }
  }

  return {
    channel: { id: channel.id, name: channel.name },
    roles: [...channel.guild.roles.cache.values()].map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
    })),
    members: [...members.values()],
    channels: [...channels.entries()].map(([id, name]) => ({ id, name })),
    messages,
    hasMore: fetched.size === 50,
  };
}

/** One message, including the reply it points at, for the live channel feed. */
export async function snapshotMessage(message: Message | PartialMessage) {
  let full: Message;
  if (message.partial) {
    try {
      full = await message.fetch();
    } catch {
      return null;
    }
  } else {
    full = message;
  }
  const raw = (await presentMessage(full)).raw;
  const referencedId = full.reference?.messageId;
  if (!referencedId) return raw;
  try {
    const referenced = (await presentMessage(await full.fetchReference())).raw;
    return { ...raw, referenced_message: referenced };
  } catch {
    return raw;
  }
}
