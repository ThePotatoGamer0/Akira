import { Router } from "express";
import type { CardQuality } from "../../../../src/generated/prisma/client.js";
import { GameError } from "../../../../src/game/errors.js";
import { seriesTitleStyle } from "../../../../src/game/series-meta.js";
import { bitsStats, cardCountStats, completionStats, setSeriesTracked } from "../../../../src/game/stats.js";
import { authMiddleware } from "../middleware/auth.js";

const QUALITIES = new Set<CardQuality>(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]);

export const statsRouter = Router();

statsRouter.use(authMiddleware);

function gameMessage(err: unknown): string {
  return err instanceof GameError ? err.message : "Akira tripped over something. Mind trying again in a moment?";
}

function queryParam(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

/** Card counts. Add a sibling route here when a new stat card needs data. */
statsRouter.get("/cards", async (req, res) => {
  const raw = queryParam(req.query["quality"]);
  if (raw && !QUALITIES.has(raw as CardQuality)) {
    res.status(400).json({ error: "Akira doesn't know that quality." });
    return;
  }
  const rows = raw ? await cardCountStats(raw as CardQuality) : await cardCountStats();
  res.json({ quality: raw || "all", rows });
});

statsRouter.get("/bits", async (_req, res) => {
  res.json({ rows: await bitsStats() });
});

statsRouter.get("/completion", async (req, res) => {
  const requested = queryParam(req.query["userId"]);
  const userId = requested || req.user!.id;
  try {
    res.json(await completionStats(userId, seriesTitleStyle(req.user!.seriesTitle)));
  } catch (err) {
    const status = err instanceof GameError && err.code === "missing" ? 404 : 400;
    res.status(status).json({ error: gameMessage(err) });
  }
});

statsRouter.post("/tracked", async (req, res) => {
  const viewer = req.user!;
  const body = req.body as { seriesId?: unknown; tracked?: unknown };
  if (typeof body.seriesId !== "string" || typeof body.tracked !== "boolean") {
    res.status(400).json({ error: "Akira needs a series and whether to track it." });
    return;
  }
  try {
    await setSeriesTracked(viewer.id, body.seriesId, body.tracked);
    res.json(await completionStats(viewer.id, seriesTitleStyle(viewer.seriesTitle)));
  } catch (err) {
    res.status(400).json({ error: gameMessage(err) });
  }
});
