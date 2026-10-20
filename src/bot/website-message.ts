import { randomBytes } from "node:crypto";
import {
  AttachmentBuilder,
  DiscordAPIError,
  StickerFormatType,
  type Client,
  type Message,
  type TextBasedChannel,
  type User,
  type Webhook,
} from "discord.js";
import { resolveDropChannelId } from "../game/drops.js";
import { isInitLocked } from "../utils/init-lock.js";

const MARK_RE = /\u200b\u200c\u200d([0-9a-f]{8}):(\d{17,20})\u200d\u200c\u200b$/;
const MAX_CONTENT = 2000;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const TICKET_MS = 30_000;

export class WebsitePostError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Ticket = { discordId: string; content: string; files: number; at: number };

const tickets = new Map<string, Ticket>();
const recentSends = new Map<string, number[]>();
let webhookCache: { channelId: string; hook: Webhook } | null = null;

export function readSpeakerMark(content: string): { text: string; key: string | null; discordId: string | null } {
  const match = MARK_RE.exec(content);
  if (!match) return { text: content, key: null, discordId: null };
  return { text: content.slice(0, match.index), key: match[1] ?? null, discordId: match[2] ?? null };
}

function speakerMark(key: string, discordId: string): string {
  return `\u200b\u200c\u200d${key}:${discordId}\u200d\u200c\u200b`;
}

function pruneTickets(now: number): void {
  for (const [key, ticket] of tickets) {
    if (now - ticket.at > TICKET_MS) tickets.delete(key);
  }
}

export function claimSpeaker(content: string, files: number): string | null {
  const now = Date.now();
  pruneTickets(now);
  const mark = readSpeakerMark(content);
  if (mark.key) {
    const ticket = tickets.get(mark.key);
    tickets.delete(mark.key);
    if (!ticket || ticket.discordId !== mark.discordId) return null;
    return ticket.discordId;
  }
  for (const [key, ticket] of tickets) {
    if (ticket.content !== mark.text || ticket.files !== files) continue;
    tickets.delete(key);
    return ticket.discordId;
  }
  return null;
}

export function stageSpeaker(key: string, discordId: string, content: string, files: number): void {
  noteSpeaker(key, { discordId, content, files, at: Date.now() });
}

function noteSpeaker(key: string, ticket: Ticket): void {
  pruneTickets(ticket.at);
  tickets.set(key, ticket);
}

function forgetSpeaker(key: string): void {
  tickets.delete(key);
}

function allowSend(discordId: string): boolean {
  const now = Date.now();
  const stamps = (recentSends.get(discordId) ?? []).filter((at) => now - at < 5_000);
  if (stamps.length >= 5) {
    recentSends.set(discordId, stamps);
    return false;
  }
  stamps.push(now);
  recentSends.set(discordId, stamps);
  return true;
}

function configuredGuildId(client: Client): string | null {
  const env = process.env["DISCORD_GUILD_ID"] ?? process.env["AKIRA_GUILD_ID"] ?? "";
  if (env) return env;
  if (client.guilds.cache.size === 1) return client.guilds.cache.first()?.id ?? null;
  return null;
}

function webhookName(name: string): string {
  const cleaned = name.replace(/[@#:`]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!cleaned || /^(clyde|discord)$/i.test(cleaned)) return "player";
  return cleaned;
}

function safeFileName(name: string, fallback: string): string {
  const base = name.split(/[/\\]/).pop() ?? fallback;
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "").slice(0, 80);
  return cleaned || fallback;
}

function allowedRemote(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname === "cdn.discordapp.com" || url.hostname === "media.discordapp.net") return url;
  if (url.hostname === "c.tenor.com" || /^media\d*\.tenor\.com$/.test(url.hostname)) return url;
  return null;
}

async function readRemote(raw: string, name: string): Promise<AttachmentBuilder> {
  const target = allowedRemote(raw);
  if (!target) throw new WebsitePostError("Akira couldn't use that attachment.", 400);
  const res = await fetch(target, { redirect: "follow" });
  const finalUrl = allowedRemote(res.url);
  if (!res.ok || !finalUrl) throw new WebsitePostError("Akira couldn't fetch that attachment.", 400);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) throw new WebsitePostError("Akira can take files up to 8 MB.", 400);
  return new AttachmentBuilder(buf, { name });
}

function explainSendError(err: unknown): WebsitePostError {
  if (err instanceof WebsitePostError) return err;
  if (err instanceof DiscordAPIError) {
    if (err.code === 50013 || err.code === 50001) {
      return new WebsitePostError(
        "Akira needs permission to post as people in the drop channel. An admin can allow Manage Webhooks.",
        403,
      );
    }
    if (err.code === 50006) return new WebsitePostError("Write a message or attach something first.", 400);
    if (err.code === 40005) return new WebsitePostError("That file is too large for Discord.", 400);
  }
  console.error("website message:", err);
  return new WebsitePostError("Akira couldn't send that.", 502);
}

async function impersonationWebhook(channel: TextBasedChannel & { guildId: string }): Promise<Webhook> {
  if (!("fetchWebhooks" in channel) || !("createWebhook" in channel)) {
    throw new WebsitePostError("Akira can't post in the drop channel.", 404);
  }
  if (webhookCache?.channelId === channel.id) return webhookCache.hook;
  const hooks = await channel.fetchWebhooks();
  const mine = hooks.find((hook) => hook.owner?.id === channel.client.user?.id && hook.name === "Akira" && hook.token);
  const hook = mine ?? (await channel.createWebhook({ name: "Akira", reason: "Website messages posted as the signed-in player" }));
  webhookCache = { channelId: channel.id, hook };
  return hook;
}

export type WebsiteAttachment = { name: string; data: Buffer };

export type WebsitePost = {
  discordId: string;
  content: string;
  files: WebsiteAttachment[];
  gifUrls: string[];
  stickerIds: string[];
};

/** Post in the drop channel with the player's name and picture, then let the message listener run commands. */
export async function postWebsiteMessage(client: Client, post: WebsitePost): Promise<void> {
  if (isInitLocked()) throw new WebsitePostError("Akira is still getting ready.", 503);
  if (!/^\d{17,20}$/.test(post.discordId)) throw new WebsitePostError("Akira couldn't tell who is signed in.", 400);
  const content = post.content.replace(/\r\n/g, "\n");
  if (content.length > MAX_CONTENT) throw new WebsitePostError("That message is too long for Discord.", 400);
  const pieces = post.files.length + post.gifUrls.length + post.stickerIds.length;
  if (!content.trim() && pieces === 0) throw new WebsitePostError("Write a message or attach something first.", 400);
  if (pieces > MAX_FILES) throw new WebsitePostError("Akira can take 10 files at a time.", 400);
  let total = 0;
  for (const file of post.files) {
    if (file.data.length > MAX_FILE_BYTES) throw new WebsitePostError("Akira can take files up to 8 MB.", 400);
    total += file.data.length;
  }
  if (total > MAX_TOTAL_BYTES) throw new WebsitePostError("Those files are too large together.", 400);

  const guildId = configuredGuildId(client);
  const channelId = guildId ? await resolveDropChannelId(guildId) : null;
  if (!channelId) throw new WebsitePostError("Akira doesn't have a drop channel yet.", 404);
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || channel.isDMBased()) {
    throw new WebsitePostError("Akira doesn't have a drop channel yet.", 404);
  }

  const user = await client.users.fetch(post.discordId).catch(() => null);
  if (!user) throw new WebsitePostError("Akira couldn't find that Discord account.", 404);
  const member = await channel.guild.members.fetch(post.discordId).catch(() => null);
  const username = webhookName(member?.displayName ?? user.globalName ?? user.username);
  const avatarURL = user.displayAvatarURL({ extension: "png", size: 128 });

  const attachments: AttachmentBuilder[] = post.files.map(
    (file, index) => new AttachmentBuilder(file.data, { name: safeFileName(file.name, `file-${index + 1}`) }),
  );
  for (const [index, url] of post.gifUrls.entries()) {
    attachments.push(await readRemote(url, safeFileName(`gif-${index + 1}.gif`, "gif.gif")));
  }
  if (post.stickerIds.length > 0) {
    const stickers = await channel.guild.stickers.fetch().catch(() => null);
    for (const id of post.stickerIds) {
      const sticker = stickers?.get(id);
      if (!sticker || sticker.format === StickerFormatType.Lottie) {
        throw new WebsitePostError("That sticker isn't on this server.", 400);
      }
      const ext = sticker.format === StickerFormatType.GIF ? "gif" : "png";
      attachments.push(await readRemote(sticker.url, safeFileName(`${sticker.name}.${ext}`, `sticker.${ext}`)));
    }
  }

  const key = randomBytes(4).toString("hex");
  const marked = `${content}${speakerMark(key, post.discordId)}`;
  if (marked.length > MAX_CONTENT) throw new WebsitePostError("That message is too long for Discord.", 400);
  if (!allowSend(post.discordId)) throw new WebsitePostError("Slow down a little and try that again.", 429);
  noteSpeaker(key, { discordId: post.discordId, content, files: attachments.length, at: Date.now() });

  const send = async (hook: Webhook) =>
    hook.send({
      content: marked,
      username,
      avatarURL,
      files: attachments,
      allowedMentions: { parse: ["users", "roles"] },
    });

  try {
    const hook = await impersonationWebhook(channel);
    try {
      await send(hook);
    } catch (err) {
      if (err instanceof DiscordAPIError && err.code === 10015) {
        webhookCache = null;
        await send(await impersonationWebhook(channel));
        return;
      }
      throw err;
    }
  } catch (err) {
    forgetSpeaker(key);
    throw explainSendError(err);
  }
}

/** The website message, spoken as the player Akira posted it for. */
export async function adoptWebsiteSpeaker(message: Message): Promise<Message | null> {
  if (!message.webhookId) return null;
  const discordId = claimSpeaker(message.content, message.attachments.size);
  if (!discordId) return null;
  const user = await message.client.users.fetch(discordId).catch(() => null);
  if (!user) return null;
  return asSpeaker(message, user);
}

function asSpeaker(message: Message, user: User): Message {
  const text = readSpeakerMark(message.content).text;
  return new Proxy(message, {
    get(target, prop, receiver) {
      if (prop === "author") return user;
      if (prop === "content") return text;
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") return value.bind(target);
      return value;
    },
  });
}
