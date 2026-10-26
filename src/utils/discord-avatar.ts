const HASH = /^[a-zA-Z0-9_]+$/;
const SNOWFLAKE = /^\d+$/;

/** Discord avatar hashes are letters, digits, and underscores (animated ones start with a_). */
export function sanitizeDiscordAvatarHash(raw: string | null | undefined): string | null {
  const hash = raw?.trim() ?? "";
  return HASH.test(hash) ? hash : null;
}

/** CDN URL for a Discord user. An empty or missing hash uses their default embed avatar. */
export function discordAvatarUrl(discordId: string, hash?: string | null): string | null {
  if (!SNOWFLAKE.test(discordId)) return null;
  const clean = sanitizeDiscordAvatarHash(hash);
  if (clean) {
    const ext = clean.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${clean}.${ext}?size=64`;
  }
  let index = 0;
  try {
    index = Number((BigInt(discordId) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export async function fetchDiscordAvatar(discordId: string): Promise<string | null | undefined> {
  const token = process.env["DISCORD_TOKEN"];
  if (!token || process.env["NODE_TEST_CONTEXT"] || !SNOWFLAKE.test(discordId)) return undefined;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1500);
  try {
    const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: ac.signal,
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { avatar?: unknown };
    if (typeof body.avatar !== "string") return null;
    return sanitizeDiscordAvatarHash(body.avatar);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
