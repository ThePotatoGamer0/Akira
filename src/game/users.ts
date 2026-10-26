import { prisma } from "../db/client.js";
import { fetchDiscordAvatar } from "../utils/discord-avatar.js";

export async function ensureUser(discordId: string, username: string) {
  const norm = username.trim().toLowerCase();
  return prisma.user.upsert({
    where: { discordId },
    create: {
      discordId,
      discordUsername: norm || null,
    },
    update: norm ? { discordUsername: norm } : {},
  });
}

export async function findUserByDiscordId(discordId: string) {
  return prisma.user.findUnique({ where: { discordId } });
}

/** Fill missing Discord avatar hashes so the WebUI can show faces. */
export async function rememberDiscordAvatars(discordIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(discordIds.filter((id) => /^\d+$/.test(id)))];
  const remembered = new Map<string, string>();
  if (unique.length === 0) return remembered;
  const existing = await prisma.user.findMany({
    where: { discordId: { in: unique } },
    select: { discordId: true, discordAvatar: true },
  });
  for (const row of existing) {
    if (row.discordAvatar != null) remembered.set(row.discordId, row.discordAvatar);
  }
  const missing = unique.filter((id) => !remembered.has(id));
  await Promise.all(
    missing.map(async (discordId) => {
      const avatar = await fetchDiscordAvatar(discordId);
      if (avatar === undefined) return;
      const stored = avatar ?? "";
      remembered.set(discordId, stored);
      await prisma.user.updateMany({ where: { discordId }, data: { discordAvatar: stored } });
    }),
  );
  return remembered;
}
