import { Router } from "express";
import { GameError } from "../../../../src/game/errors.js";
import { claimMilestone, economySnapshot, giveToPool, prestigeCycle, buyShopBuff } from "../../../../src/game/live-buffs.js";
import { authMiddleware } from "../middleware/auth.js";

export const economyRouter = Router();

function configuredGuildId(): string {
  return process.env["DISCORD_GUILD_ID"] ?? process.env["AKIRA_GUILD_ID"] ?? "";
}

function fail(res: { status: (code: number) => { json: (body: unknown) => void } }, err: unknown) {
  if (err instanceof GameError) {
    res.status(400).json({ error: err.message });
    return;
  }
  throw err;
}

economyRouter.get("/bits", authMiddleware, async (req, res) => {
  res.json({ bits: req.user!.bits });
});

economyRouter.get("/status", authMiddleware, async (req, res) => {
  const guildId = configuredGuildId();
  try {
    const view = await economySnapshot(req.user!.id, guildId || null);
    res.json(view);
  } catch (err) {
    fail(res, err);
  }
});

economyRouter.get("/shop", authMiddleware, async (req, res) => {
  const guildId = configuredGuildId();
  const view = await economySnapshot(req.user!.id, guildId || null);
  res.json({ items: view.shopItems, bits: view.bits, featuredName: view.featuredName });
});

economyRouter.post("/shop/buy", authMiddleware, async (req, res) => {
  const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
  try {
    const name = req.user!.discordUsername ?? req.user!.discordId;
    const bought = await buyShopBuff(req.user!.discordId, name, itemId);
    res.json({ ok: true, itemId, name: bought.name, bits: bought.bits, seriesName: bought.seriesName });
  } catch (err) {
    fail(res, err);
  }
});

economyRouter.get("/pool", authMiddleware, async (req, res) => {
  const guildId = configuredGuildId();
  if (!guildId) {
    res.status(503).json({ error: "Server pool isn't configured yet (missing DISCORD_GUILD_ID)." });
    return;
  }
  const view = await economySnapshot(req.user!.id, guildId);
  res.json(view.pool);
});

economyRouter.post("/pool/contribute", authMiddleware, async (req, res) => {
  const guildId = configuredGuildId();
  if (!guildId) {
    res.status(503).json({ error: "Server pool isn't configured yet." });
    return;
  }
  const bits = Number(req.body?.bits);
  try {
    const name = req.user!.discordUsername ?? req.user!.discordId;
    const given = await giveToPool(req.user!.discordId, name, guildId, bits);
    res.json({ ok: true, poolTotal: given.poolTotal, progress: given.progress, balance: given.balance });
  } catch (err) {
    fail(res, err);
  }
});

economyRouter.post("/milestone/claim", authMiddleware, async (req, res) => {
  try {
    const name = req.user!.discordUsername ?? req.user!.discordId;
    const claimed = await claimMilestone(req.user!.discordId, name);
    res.json({ ok: true, ...claimed });
  } catch (err) {
    fail(res, err);
  }
});

economyRouter.post("/prestige", authMiddleware, async (req, res) => {
  try {
    const name = req.user!.discordUsername ?? req.user!.discordId;
    const result = await prestigeCycle(req.user!.discordId, name);
    res.json({ ok: true, ...result });
  } catch (err) {
    fail(res, err);
  }
});
