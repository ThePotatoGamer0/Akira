import { prisma } from "../db/client.js";

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
