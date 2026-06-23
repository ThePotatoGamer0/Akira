import { Router } from "express";
import { prisma } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

export const leaderboardRouter = Router();

leaderboardRouter.use(authMiddleware);

leaderboardRouter.get("/", async (_req, res) => {
  const rows = await prisma.user.findMany({
    take: 50,
    orderBy: [{ bits: "desc" }, { prestigeLevel: "desc" }],
    select: {
      id: true,
      discordUsername: true,
      bits: true,
      prestigeLevel: true,
      _count: { select: { cards: true } },
    },
  });
  res.json({
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.id,
      discordUsername: r.discordUsername,
      bits: r.bits,
      prestigeLevel: r.prestigeLevel,
      cardCount: r._count.cards,
    })),
  });
});
