import { Router } from "express";
import {
  catalogCharacter,
  catalogSearch,
  catalogSeries,
  catalogSeriesDetail,
  setCatalogWishlist,
} from "../../../../src/game/catalog.js";
import { GameError } from "../../../../src/game/errors.js";
import { seriesTitleStyle } from "../../../../src/game/series-meta.js";
import { authMiddleware } from "../middleware/auth.js";

export const lookupRouter = Router();
lookupRouter.use(authMiddleware);

function gameMessage(err: unknown): string {
  return err instanceof GameError ? err.message : "Akira tripped over something. Mind trying again in a moment?";
}

function gameStatus(err: unknown): number {
  return err instanceof GameError && err.code === "missing" ? 404 : 400;
}

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

lookupRouter.get("/catalog", async (req, res) => {
  const q = typeof req.query["q"] === "string" ? req.query["q"] : "";
  const viewOrder = typeof req.query["order"] === "string" ? req.query["order"] : "completion";
  const style = seriesTitleStyle(req.user!.seriesTitle);
  try {
    if (q.trim()) {
      res.json(await catalogSearch(req.user!.id, q, style, viewOrder));
      return;
    }
    res.json({ series: await catalogSeries(req.user!.id, style), characters: [] });
  } catch (err) {
    res.status(gameStatus(err)).json({ error: gameMessage(err) });
  }
});

lookupRouter.get("/series/:seriesSlug", async (req, res) => {
  try {
    res.json(
      await catalogSeriesDetail(req.user!.id, param(req.params["seriesSlug"]), seriesTitleStyle(req.user!.seriesTitle)),
    );
  } catch (err) {
    res.status(gameStatus(err)).json({ error: gameMessage(err) });
  }
});

lookupRouter.get("/series/:seriesSlug/characters/:characterSlug", async (req, res) => {
  try {
    res.json(
      await catalogCharacter(
        req.user!.id,
        param(req.params["seriesSlug"]),
        param(req.params["characterSlug"]),
        seriesTitleStyle(req.user!.seriesTitle),
      ),
    );
  } catch (err) {
    res.status(gameStatus(err)).json({ error: gameMessage(err) });
  }
});

lookupRouter.post("/series/:seriesSlug/characters/:characterSlug/wishlist", async (req, res) => {
  const watching = (req.body as { watching?: unknown }).watching;
  if (typeof watching !== "boolean") {
    res.status(400).json({ error: "Akira needs to know whether to watch that character." });
    return;
  }
  try {
    const style = seriesTitleStyle(req.user!.seriesTitle);
    const detail = await catalogCharacter(
      req.user!.id,
      param(req.params["seriesSlug"]),
      param(req.params["characterSlug"]),
      style,
    );
    await setCatalogWishlist(req.user!.id, detail.id, watching);
    res.json(
      await catalogCharacter(
        req.user!.id,
        param(req.params["seriesSlug"]),
        param(req.params["characterSlug"]),
        style,
      ),
    );
  } catch (err) {
    res.status(gameStatus(err)).json({ error: gameMessage(err) });
  }
});
