import { prisma } from "../db/client.js";

/** Keep DB discordUsername in sync so browser WebUI can look you up by handle. */
export async function syncDiscordUsernameForWebUi(discordId: string, username: string): Promise<void> {
  const norm = username.trim().toLowerCase();
  if (!norm) return;

  await prisma.user.upsert({
    where: { discordId },
    create: { discordId, discordUsername: norm },
    update: { discordUsername: norm },
  });
}
