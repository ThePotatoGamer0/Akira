import { prisma } from "../db/client.js";

type DiscordProfile = { id: string; username: string };

type Cached = { userId: string; expiresAt: number };

const cache = new Map<string, Cached>();

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

async function discordProfile(accessToken: string): Promise<DiscordProfile | null> {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id?: unknown; username?: unknown };
  if (typeof body.id !== "string" || typeof body.username !== "string") return null;
  return { id: body.id, username: body.username };
}

export async function exchangeActivityCode(code: string): Promise<string | null> {
  const clientId = process.env["DISCORD_CLIENT_ID"];
  const clientSecret = process.env["DISCORD_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are required for the activity.");
  }
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: unknown };
  return typeof body.access_token === "string" ? body.access_token : null;
}

/** The bot's player row for this Discord account, by id or username. */
export async function userForDiscordAccount(profile: DiscordProfile) {
  const byId = await prisma.user.findUnique({ where: { discordId: profile.id } });
  if (byId) return byId;
  const username = normalizeUsername(profile.username);
  if (!username) return null;
  return prisma.user.findUnique({ where: { discordUsername: username } });
}

export async function userForActivityToken(accessToken: string) {
  const hit = cache.get(accessToken);
  if (hit && hit.expiresAt > Date.now()) {
    return prisma.user.findUnique({ where: { id: hit.userId } });
  }
  const profile = await discordProfile(accessToken);
  if (!profile) return null;
  const user = await userForDiscordAccount(profile);
  if (!user) return null;
  cache.set(accessToken, { userId: user.id, expiresAt: Date.now() + 5 * 60 * 1000 });
  return user;
}

export async function profileForActivityToken(accessToken: string): Promise<DiscordProfile | null> {
  return discordProfile(accessToken);
}
