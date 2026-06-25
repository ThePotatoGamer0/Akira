import { Router } from "express";
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

  res.json({
    cards: cards.map((c) => {
      const { character: ch } = c.variant;
      // Fixed: Replaced the slash with a hyphen between ch.slug and c.variant.id to match the physical directory
      const base = `/api/static/cards/${ch.series.slug}/${ch.slug}-${c.variant.id}/${c.frameId}`;
      
      return {
        id: c.id,
        printNumber: c.printNumber,
        quality: c.quality,
        frameId: c.frameId,
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