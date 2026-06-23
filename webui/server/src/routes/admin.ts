import { Router } from "express";
import { prisma } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { adminOnly } from "../middleware/adminOnly.js";
import { runGenerateDetached } from "../utils/run-generate.js";

export const adminRouter = Router();

adminRouter.use(authMiddleware, adminOnly);

adminRouter.get("/characters", async (_req, res) => {
  const characters = await prisma.character.findMany({
    include: { series: true },
    orderBy: [{ series: { slug: "asc" } }, { slug: "asc" }],
  });
  res.json({
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      series: { id: c.series.id, name: c.series.name, slug: c.series.slug },
    })),
  });
});

adminRouter.post("/characters", async (req, res) => {
  const seriesSlug =
    typeof req.body?.seriesSlug === "string" ? req.body.seriesSlug.trim().toLowerCase() : "";
  const seriesName =
    typeof req.body?.seriesName === "string" ? req.body.seriesName.trim() : "";
  const characterName =
    typeof req.body?.characterName === "string" ? req.body.characterName.trim() : "";
  const characterSlug =
    typeof req.body?.characterSlug === "string"
      ? req.body.characterSlug.trim().toLowerCase()
      : "";

  if (!seriesSlug || !characterName || !characterSlug) {
    res.status(400).json({ error: "Akira needs seriesSlug, characterName, and characterSlug." });
    return;
  }

  const sName = seriesName || seriesSlug.replace(/-/g, " ");
  const series = await prisma.series.upsert({
    where: { slug: seriesSlug },
    create: { name: sName, slug: seriesSlug },
    update: seriesName ? { name: seriesName } : {},
  });

  const ch = await prisma.character.create({
    data: {
      name: characterName,
      slug: characterSlug,
      seriesId: series.id,
    },
    include: { series: true },
  });
  res.status(201).json({
    id: ch.id,
    name: ch.name,
    slug: ch.slug,
    series: { id: ch.series.id, name: ch.series.name, slug: ch.series.slug },
  });
});

adminRouter.delete("/characters/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.character.delete({ where: { id } });
  } catch {
    res.status(404).json({ error: "Character not found." });
    return;
  }
  res.json({ ok: true });
});

adminRouter.post("/init", (_req, res) => {
  runGenerateDetached();
  res.status(202).json({
    status: "started",
    message: "Akira queued a full asset regeneration — this can take a while.",
  });
});
