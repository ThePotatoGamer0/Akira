import { PermissionFlagsBits, StickerFormatType, type Client } from "discord.js";
import { resolveDropChannelId } from "../game/drops.js";

function configuredGuildId(client: Client): string | null {
  const env = process.env["DISCORD_GUILD_ID"] ?? process.env["AKIRA_GUILD_ID"] ?? "";
  if (env) return env;
  if (client.guilds.cache.size === 1) return client.guilds.cache.first()?.id ?? null;
  return null;
}

export type ComposerAssets = {
  emojis: Array<{ id: string; name: string; animated: boolean }>;
  stickers: Array<{ id: string; name: string; url: string }>;
  /** The timeout is live, so it is read per request rather than with the cached assets. */
  permissions?: { canAttachFiles: boolean; canEmbedLinks: boolean; timedOutUntil: string | null; unavailable: boolean };
};

let cache: { at: number; body: ComposerAssets } | null = null;

/**
 * What the player themselves may post in the drop channel. A webhook posts with
 * Akira's rights, so the website has to know the player's own before it offers
 * the file and gif buttons.
 */
export async function readComposerPermissions(
  client: Client,
  discordId: string,
): Promise<{ canAttachFiles: boolean; canEmbedLinks: boolean; timedOutUntil: string | null; unavailable: boolean }> {
  const denied = { canAttachFiles: false, canEmbedLinks: false, timedOutUntil: null, unavailable: true };
  if (!/^\d{17,20}$/.test(discordId)) return denied;
  const guildId = configuredGuildId(client);
  if (!guildId) return denied;
  const channelId = await resolveDropChannelId(guildId);
  if (!channelId) return denied;
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(channelId);
  if (!channel) return denied;
  const member = await guild.members.fetch(discordId).catch(() => null);
  // Discord takes every permission away for the length of a timeout, so she says
  // why rather than showing a composer the player cannot use.
  const until = member?.communicationDisabledUntil;
  const timedOutUntil = until && until.getTime() > Date.now() ? until.toISOString() : null;
  const permissions = channel.permissionsFor(member ?? discordId);
  if (!permissions) return { ...denied, timedOutUntil };
  return {
    canAttachFiles: permissions.has(PermissionFlagsBits.AttachFiles),
    canEmbedLinks: permissions.has(PermissionFlagsBits.EmbedLinks),
    timedOutUntil,
    unavailable: false,
  };
}

/** Guild emoji and stickers for the website message bar. */
export async function readComposerAssets(client: Client): Promise<ComposerAssets> {
  if (cache && Date.now() - cache.at < 30_000) return cache.body;
  const empty: ComposerAssets = { emojis: [], stickers: [] };
  const guildId = configuredGuildId(client);
  if (!guildId) return empty;
  const guild = await client.guilds.fetch(guildId);
  const emojis = [...(await guild.emojis.fetch()).values()]
    .filter((emoji) => emoji.name)
    .map((emoji) => ({ id: emoji.id, name: emoji.name ?? "emoji", animated: emoji.animated ?? false }));
  let stickers: ComposerAssets["stickers"] = [];
  try {
    const fetched = await guild.stickers.fetch();
    stickers = [...fetched.values()]
      .filter((sticker) => sticker.format !== StickerFormatType.Lottie)
      .map((sticker) => ({ id: sticker.id, name: sticker.name, url: sticker.url }));
  } catch {
    stickers = [];
  }
  const body = { emojis, stickers };
  cache = { at: Date.now(), body };
  return body;
}
