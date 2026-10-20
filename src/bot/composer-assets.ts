import { StickerFormatType, type Client } from "discord.js";

function configuredGuildId(client: Client): string | null {
  const env = process.env["DISCORD_GUILD_ID"] ?? process.env["AKIRA_GUILD_ID"] ?? "";
  if (env) return env;
  if (client.guilds.cache.size === 1) return client.guilds.cache.first()?.id ?? null;
  return null;
}

export type ComposerAssets = {
  emojis: Array<{ id: string; name: string; animated: boolean }>;
  stickers: Array<{ id: string; name: string; url: string }>;
};

let cache: { at: number; body: ComposerAssets } | null = null;

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
