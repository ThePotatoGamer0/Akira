import { Router } from "express";
import { displayFrameId, serverDefaultFrame } from "../../../../src/game/frames.js";
import { prisma } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

export const collectionRouter = Router();

collectionRouter.use(authMiddleware);

collectionRouter.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  const viewer = req.user!;
  if (viewer.id !== userId && !viewer.isAdmin) {
    res.status(403).json({ error: "Akira can only show that collection to its owner (or an admin)." });
    return;
  }
  
  const cards = await prisma.card.findMany({
    where: { ownerId: userId },
    include: {
      variant: {
        include: {
          character: { include: { series: true } },
        },
      },
    },
    orderBy: [{ obtainedAt: "desc" }],
  });

  const serverFrame = await serverDefaultFrame(process.env["DISCORD_GUILD_ID"] ?? null);
  res.json({
    cards: cards.map((c) => {
      const { character: ch } = c.variant;
      const dye = c.dye && /^[a-zA-Z0-9_-]+$/.test(c.dye) ? c.dye : "none";
      const frameId = displayFrameId(c.frameId, serverFrame);
      const base = `/api/static/cards/${c.variant.id}/${frameId}/p${c.printNumber}/${dye}`;
      
      return {
        id: c.id,
        printNumber: c.printNumber,
        quality: c.quality,
        frameId,
        tag: c.tag,
        alias: c.alias,
        dye: c.dye,
        obtainedAt: c.obtainedAt,
        variant: { id: c.variant.id, name: c.variant.name },
        character: { id: ch.id, name: ch.name, slug: ch.slug },
        series: { id: ch.series.id, name: ch.series.name, slug: ch.series.slug },
        assets: {
          normal: `${base}/normal.png`,
          shiny: `${base}/shiny.apng`,
          burn: `${base}/burn.apng`,
        },
      };
    }),
  });
});