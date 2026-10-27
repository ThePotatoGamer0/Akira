import { prisma } from "../db/client.js";
import { GameError } from "./errors.js";
import { ensureUser } from "./users.js";
import {
  BUFF_KINDS,
  combinedLines,
  extendExpiry,
  MILESTONES,
  missedMidnight,
  nextMilestone,
  pickServerBuffs,
  poolChoices,
  poolTier,
  prestigeKinds,
  prestigeLine,
  prestigePreview,
  resolveEffects,
  shopItem,
  SHOP_ITEMS,
  utcDay,
  type ActiveEffects,
  type BuffKind,
  type PrestigeKind,
  type PrestigeStacks,
  type ResolvedEffects,
} from "./buffs.js";

const EMPTY: PrestigeStacks = { burn: 0, grab: 0, drop: 0, mint: 0, main: 0 };

function isBuffKind(value: string): value is BuffKind {
  return (BUFF_KINDS as readonly string[]).includes(value);
}

export function parseServerBuffs(value: string | null | undefined): BuffKind[] {
  if (!value) return [];
  return value.split(",").filter(isBuffKind);
}

function stacksFrom(rows: { kind: string; stacks: number }[]): PrestigeStacks {
  const stacks = { ...EMPTY };
  for (const row of rows) {
    if (row.kind === "burn" || row.kind === "grab" || row.kind === "drop" || row.kind === "mint" || row.kind === "main") {
      stacks[row.kind] = row.stacks;
    }
  }
  return stacks;
}

export async function featuredSeries(now = new Date()): Promise<{ seriesId: string; name: string } | null> {
  const day = utcDay(now);
  const saved = await prisma.featuredSeries.findUnique({ where: { id: "shop" } });
  if (saved?.day === day) {
    const series = await prisma.series.findUnique({ where: { id: saved.seriesId } });
    if (series) return { seriesId: series.id, name: series.name };
  }
  const series = await prisma.series.findMany({
    where: { characters: { some: {} } },
    orderBy: { slug: "asc" },
    include: { _count: { select: { characters: true } } },
  });
  // A series with one character cannot make a varied featured drop.
  const eligible = series.filter((row) => row._count.characters > 1);
  if (eligible.length === 0) return null;
  const pick = eligible[Math.floor(Math.random() * eligible.length)]!;
  await prisma.featuredSeries.upsert({
    where: { id: "shop" },
    create: { id: "shop", day, seriesId: pick.id },
    update: { day, seriesId: pick.id },
  });
  return { seriesId: pick.id, name: pick.name };
}

export async function activeEffects(userId: string, guildId: string | null, now = new Date()): Promise<ResolvedEffects> {
  const [buffs, prestige, pool] = await Promise.all([
    prisma.buff.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.prestigeBuff.findMany({ where: { userId } }),
    guildId ? prisma.serverPool.findUnique({ where: { guildId } }) : Promise.resolve(null),
  ]);
  const shop = buffs.map((row) => row.kind).filter(isBuffKind);
  const series = buffs.find((row) => row.kind === "featured_series")?.seriesId ?? null;
  const serverLive = pool?.buffExpiry && pool.buffExpiry.getTime() > now.getTime();
  const input: ActiveEffects = {
    shop,
    server: serverLive ? parseServerBuffs(pool?.activeBuff) : [],
    seriesId: series,
    prestige: stacksFrom(prestige),
  };
  return resolveEffects(input);
}

export function shopExplanation(id: BuffKind, featuredName: string | null): string {
  const item = shopItem(id);
  if (!item) return "";
  if (id === "featured_series") {
    const name = featuredName ?? "whichever series is featured tonight";
    return `Today's featured series is ${name}. Buying locks it in, and each card has a 90% chance to come from that series.`;
  }
  return item.description;
}

export async function buyShopBuff(discordId: string, username: string, kind: string, now = new Date()) {
  const item = shopItem(kind);
  if (!item) throw new GameError("unknown", "Akira doesn't stock that item.");
  const user = await ensureUser(discordId, username);
  const featured = item.id === "featured_series" ? await featuredSeries(now) : null;
  if (item.id === "featured_series" && !featured) {
    throw new GameError("empty", "Akira has no series to feature yet.");
  }

  return prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (!fresh || fresh.bits < item.priceBits) {
      throw new GameError("bits", "You don't have enough bits for that.");
    }
    const current = await tx.buff.findUnique({
      where: { userId_kind: { userId: user.id, kind: item.id } },
    });
    const stillRunning = current !== null && current.expiresAt.getTime() > now.getTime();
    const seriesId =
      item.id === "featured_series"
        ? stillRunning && current?.seriesId
          ? current.seriesId
          : featured?.seriesId ?? null
        : null;
    const expiresAt = extendExpiry(current?.expiresAt ?? null, now, item.durationHours * 60 * 60 * 1000);
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { bits: { decrement: item.priceBits } },
    });
    await tx.buff.upsert({
      where: { userId_kind: { userId: user.id, kind: item.id } },
      create: { userId: user.id, kind: item.id, expiresAt, seriesId },
      update: { expiresAt, seriesId },
    });
    return {
      name: item.name,
      bits: updated.bits,
      expiresAt,
      seriesName: featured && seriesId === featured.seriesId ? featured.name : null,
    };
  });
}

export async function giveToPool(discordId: string, username: string, guildId: string, bits: number) {
  const whole = Math.floor(bits);
  if (!Number.isFinite(bits) || whole < 1) {
    throw new GameError("amount", "Akira needs a positive bit amount to add to the pool.");
  }
  const user = await ensureUser(discordId, username);
  const today = utcDay();
  await prisma.serverPool.upsert({
    where: { guildId },
    create: { guildId, totalBits: 0 },
    update: {},
  });
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (!fresh || fresh.bits < whole) {
      throw new GameError("bits", "You don't have that many bits to give.");
    }
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { bits: { decrement: whole }, milestoneProgress: { increment: whole } },
    });
    const pool = await tx.serverPool.update({
      where: { guildId },
      data: { totalBits: { increment: whole } },
    });
    await tx.userPoolContribution.create({
      data: { userId: user.id, guildId, bits: whole, date: today },
    });
    return { poolTotal: pool.totalBits, progress: updated.milestoneProgress, balance: updated.bits };
  });
}

export async function claimMilestone(discordId: string, username: string) {
  const user = await ensureUser(discordId, username);
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (!fresh) throw new GameError("missing", "Akira hasn't met you yet.");
    const next = nextMilestone(fresh.milestoneCount);
    if (!next) throw new GameError("done", "You've claimed every milestone this cycle.");
    if (fresh.milestoneProgress < next.cost) {
      const left = next.cost - fresh.milestoneProgress;
      throw new GameError("short", `That milestone still needs ${left.toLocaleString("en-US")} bits given to the pool.`);
    }
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        milestoneCount: { increment: 1 },
        milestoneProgress: { decrement: next.cost },
        bits: { increment: next.payout },
      },
    });
    return {
      step: next.step,
      payout: next.payout,
      balance: updated.bits,
      claimed: updated.milestoneCount,
      progress: updated.milestoneProgress,
    };
  });
}

export async function prestigeCycle(discordId: string, username: string) {
  const user = await ensureUser(discordId, username);
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (!fresh) throw new GameError("missing", "Akira hasn't met you yet.");
    if (fresh.milestoneCount < 5) {
      throw new GameError("early", "Prestige opens once milestone 5 is claimed.");
    }
    const kinds = prestigeKinds(fresh.milestoneCount);
    for (const kind of kinds) {
      await tx.prestigeBuff.upsert({
        where: { userId_kind: { userId: user.id, kind } },
        create: { userId: user.id, kind, stacks: 1 },
        update: { stacks: { increment: 1 } },
      });
    }
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { milestoneCount: 0, milestoneProgress: 0, prestigeLevel: { increment: 1 } },
    });
    const rows = await tx.prestigeBuff.findMany({ where: { userId: user.id } });
    return {
      prestigeLevel: updated.prestigeLevel,
      kept: rows.map((row) => prestigeLine(row.kind as PrestigeKind, row.stacks)),
    };
  });
}

export type PoolRollResult = {
  guildId: string;
  spent: boolean;
  tier: number;
  buffs: BuffKind[];
  pot: number;
};

export async function rollServerPool(guildId: string, now = new Date(), rng: () => number = Math.random): Promise<PoolRollResult | null> {
  const pool = await prisma.serverPool.findUnique({ where: { guildId } });
  if (!pool || !missedMidnight(pool.lastReset, now)) return null;
  const tier = poolTier(pool.totalBits);
  if (tier === 0) {
    await prisma.serverPool.update({
      where: { guildId },
      data: { lastReset: now },
    });
    return { guildId, spent: false, tier: 0, buffs: [], pot: pool.totalBits };
  }
  const buffs = pickServerBuffs(tier, rng);
  await prisma.serverPool.update({
    where: { guildId },
    data: {
      totalBits: 0,
      lastReset: now,
      activeBuff: buffs.join(","),
      buffTier: tier,
      buffExpiry: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    },
  });
  return { guildId, spent: true, tier, buffs, pot: pool.totalBits };
}

export async function rollDuePools(
  now = new Date(),
  rng: () => number = Math.random,
  guildIds?: ReadonlySet<string>,
): Promise<PoolRollResult[]> {
  const pools = await prisma.serverPool.findMany();
  const results: PoolRollResult[] = [];
  for (const pool of pools) {
    if (guildIds && !guildIds.has(pool.guildId)) continue;
    const result = await rollServerPool(pool.guildId, now, rng);
    if (result) results.push(result);
  }
  return results;
}

function buffName(kind: string): string {
  return shopItem(kind)?.name ?? kind;
}

export async function economySnapshot(userId: string, guildId: string | null, now = new Date()) {
  const [user, buffs, prestige, pool, featured] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.buff.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.prestigeBuff.findMany({ where: { userId } }),
    guildId ? prisma.serverPool.findUnique({ where: { guildId } }) : Promise.resolve(null),
    featuredSeries(now),
  ]);
  if (!user) throw new GameError("missing", "Akira hasn't met you yet.");
  const shopKinds = buffs.map((row) => row.kind).filter(isBuffKind);
  const seriesId = buffs.find((row) => row.kind === "featured_series")?.seriesId ?? null;
  const serverLive = Boolean(pool?.buffExpiry && pool.buffExpiry.getTime() > now.getTime());
  const serverKinds = serverLive ? parseServerBuffs(pool?.activeBuff) : [];
  const stacks = stacksFrom(prestige);
  const effects: ActiveEffects = { shop: shopKinds, server: serverKinds, seriesId, prestige: stacks };
  const claimed = user.milestoneCount;
  const preview = prestigePreview(claimed, user.milestoneProgress);
  const upcoming = nextMilestone(claimed);
  const tier = poolTier(pool?.totalBits ?? 0);
  const choices = poolChoices(tier).map(buffName);
  const seriesName = seriesId
    ? (await prisma.series.findUnique({ where: { id: seriesId } }))?.name ?? null
    : null;

  return {
    bits: user.bits,
    shopItems: SHOP_ITEMS.map((item) => ({
      ...item,
      description: shopExplanation(item.id, featured?.name ?? null),
    })),
    featuredName: featured?.name ?? null,
    shop: buffs.map((row) => ({
      kind: row.kind,
      name: buffName(row.kind),
      expiresAt: row.expiresAt.toISOString(),
      seriesName: row.kind === "featured_series" ? seriesName : null,
    })),
    server: serverLive && pool?.buffExpiry
      ? {
          names: serverKinds.map(buffName),
          expiresAt: pool.buffExpiry.toISOString(),
          tier: pool.buffTier,
        }
      : null,
    prestige: prestige
      .filter((row) => row.stacks > 0)
      .map((row) => ({
        kind: row.kind,
        stacks: row.stacks,
        line: prestigeLine(row.kind as PrestigeKind, row.stacks),
      })),
    combined: combinedLines(effects),
    pool: {
      totalBits: pool?.totalBits ?? 0,
      tier,
      choices,
      live: serverKinds.map(buffName),
      buffExpiry: serverLive ? pool?.buffExpiry?.toISOString() ?? null : null,
    },
    milestones: MILESTONES.map((row) => ({
      step: row.step,
      cost: row.cost,
      payout: row.payout,
      prestige: row.step >= 6 ? prestigeLine(prestigeKinds(row.step).at(-1)!, 1) : null,
      claimed: claimed >= row.step,
    })),
    progress: user.milestoneProgress,
    claimed,
    bitsLeft: preview.bitsLeft,
    prestigePreview: preview,
    canClaim: upcoming !== null && user.milestoneProgress >= upcoming.cost,
  };
}
