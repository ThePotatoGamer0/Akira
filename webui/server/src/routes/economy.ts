import { Router } from "express";
import { prisma } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { SHOP_ITEMS } from "../utils/shop.js";
import { POOL_TIER_THRESHOLDS, poolChanceForTier, tierFromPoolBits } from "../utils/pool.js";

export const economyRouter = Router();

economyRouter.get("/bits", authMiddleware, async (req, res) => {
  res.json({ bits: req.user!.bits });
});

economyRouter.get("/shop", authMiddleware, (_req, res) => {
  res.json({ items: SHOP_ITEMS });
});

economyRouter.post("/shop/buy", authMiddleware, async (req, res) => {
  const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) {
    res.status(400).json({ error: "Akira doesn't stock that item." });
    return;
  }
  const u = req.user!;
  if (u.bits < item.priceBits) {
    res.status(400).json({ error: "Not enough bits for that - keep collecting!" });
    return;
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: u.id },
      data: { bits: u.bits - item.priceBits },
    }),
    prisma.inventory.upsert({
      where: {
        userId_itemType: { userId: u.id, itemType: `shop:${item.id}` },
      },
      create: { userId: u.id, itemType: `shop:${item.id}`, quantity: 1 },
      update: { quantity: { increment: 1 } },
    }),
  ]);
  res.json({ ok: true, itemId: item.id, name: item.name });
});

economyRouter.get("/pool", authMiddleware, async (req, res) => {
  const guildId = process.env["AKIRA_GUILD_ID"] ?? "";
  if (!guildId) {
    res.status(503).json({ error: "Server pool isn't configured yet (missing AKIRA_GUILD_ID)." });
    return;
  }
  let pool = await prisma.serverPool.findUnique({ where: { guildId } });
  if (!pool) {
    pool = await prisma.serverPool.create({
      data: { guildId, totalBits: 0, buffTier: 0 },
    });
  }
  const tier = tierFromPoolBits(pool.totalBits);
  res.json({
    guildId: pool.guildId,
    totalBits: pool.totalBits,
    tierReached: tier,
    nextTierThreshold: tier < 5 ? (POOL_TIER_THRESHOLDS[tier + 1] ?? null) : null,
    rollChanceNextReset: poolChanceForTier(tier),
    activeBuff: pool.activeBuff,
    buffTier: pool.buffTier,
    buffExpiry: pool.buffExpiry,
    lastReset: pool.lastReset,
  });
});

economyRouter.post("/pool/contribute", authMiddleware, async (req, res) => {
  const guildId = process.env["AKIRA_GUILD_ID"] ?? "";
  if (!guildId) {
    res.status(503).json({ error: "Server pool isn't configured yet." });
    return;
  }
  const bits = Number(req.body?.bits);
  if (!Number.isFinite(bits) || bits < 1) {
    res.status(400).json({ error: "Akira needs a positive bit amount to add to the pool." });
    return;
  }
  const whole = Math.floor(bits);
  const u = req.user!;
  if (u.bits < whole) {
    res.status(400).json({ error: "You don't have that many bits to give." });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  let pool = await prisma.serverPool.findUnique({ where: { guildId } });
  if (!pool) {
    pool = await prisma.serverPool.create({ data: { guildId, totalBits: 0 } });
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: u.id },
      data: {
        bits: u.bits - whole,
        milestoneProgress: { increment: whole },
      },
    }),
    prisma.serverPool.update({
      where: { guildId },
      data: { totalBits: pool.totalBits + whole },
    }),
    prisma.userPoolContribution.create({
      data: {
        userId: u.id,
        guildId,
        bits: whole,
        date: today,
      },
    }),
  ]);
  const updated = await prisma.serverPool.findUnique({ where: { guildId } });
  res.json({ ok: true, poolTotal: updated?.totalBits ?? 0 });
});
