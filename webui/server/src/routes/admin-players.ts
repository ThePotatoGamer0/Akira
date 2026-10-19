import { Router } from "express";
import type { CooldownType } from "../../../../src/generated/prisma/client.js";
import { BUFF_KINDS, type BuffKind } from "../../../../src/game/buffs.js";
import { prisma } from "../db/client.js";
import { HOST_DISCORD_ID } from "../host.js";
import { sanitizePreferredName } from "../utils/akira-address-name.js";

export const adminPlayersRouter = Router();

const PRESTIGE_KINDS = ["burn", "grab", "drop", "mint", "main"] as const;
const COOLDOWN_TYPES = ["GRAB", "DROP", "DAILY"] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function whole(value: unknown, min = 0, max = 2_000_000_000): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function when(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function playerQuery(q: string) {
  if (!q) return {};
  return {
    OR: [
      { discordUsername: { contains: q } },
      { discordId: { contains: q } },
      { preferredName: { contains: q } },
      { id: q },
    ],
  };
}

adminPlayersRouter.get("/", async (req, res) => {
  const q = text(req.query["q"]).toLowerCase();
  const players = await prisma.user.findMany({
    where: playerQuery(q),
    orderBy: [{ discordUsername: "asc" }],
    take: 40,
    select: {
      id: true,
      discordId: true,
      discordUsername: true,
      preferredName: true,
      bits: true,
      prestigeLevel: true,
    },
  });
  res.json({ players });
});

adminPlayersRouter.get("/:id", async (req, res) => {
  const player = await prisma.user.findUnique({
    where: { id: req.params["id"] },
    select: {
      id: true,
      discordId: true,
      discordUsername: true,
      preferredName: true,
      bits: true,
      prestigeLevel: true,
      milestoneCount: true,
      milestoneProgress: true,
      passiveBitsBonus: true,
      dropsSinceMint: true,
      defaultFrameId: true,
      lastGrabbedCardId: true,
      buffs: { orderBy: { kind: "asc" } },
      prestigeBuffs: { orderBy: { kind: "asc" } },
      cooldowns: { orderBy: { type: "asc" } },
    },
  });
  if (!player) {
    res.status(404).json({ error: "Akira couldn't find that player." });
    return;
  }
  const seriesIds = player.buffs.map((buff) => buff.seriesId).filter((id): id is string => Boolean(id));
  const series = seriesIds.length
    ? await prisma.series.findMany({ where: { id: { in: seriesIds } }, select: { id: true, slug: true } })
    : [];
  const slugOf = new Map(series.map((row) => [row.id, row.slug]));
  res.json({
    player: {
      ...player,
      buffs: player.buffs.map((buff) => ({
        ...buff,
        expiresAt: buff.expiresAt.toISOString(),
        seriesId: (buff.seriesId && slugOf.get(buff.seriesId)) || buff.seriesId,
      })),
      cooldowns: player.cooldowns.map((cooldown) => ({
        ...cooldown,
        expiresAt: cooldown.expiresAt.toISOString(),
      })),
    },
  });
});

adminPlayersRouter.post("/", async (req, res) => {
  const discordId = text(req.body?.discordId);
  const discordUsername = text(req.body?.discordUsername).toLowerCase();
  if (!/^\d{5,22}$/.test(discordId)) {
    res.status(400).json({ error: "Akira needs a Discord id made of digits." });
    return;
  }
  if (discordUsername && !/^[a-z0-9._]{2,32}$/.test(discordUsername)) {
    res.status(400).json({ error: "That Discord username doesn't look right." });
    return;
  }
  try {
    const player = await prisma.user.create({
      data: {
        discordId,
        discordUsername: discordUsername || null,
      },
      select: { id: true, discordId: true, discordUsername: true },
    });
    res.status(201).json({ player });
  } catch {
    res.status(409).json({ error: "A player with that Discord id or username already exists." });
  }
});

adminPlayersRouter.patch("/:id", async (req, res) => {
  const id = req.params["id"];
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    res.status(404).json({ error: "Akira couldn't find that player." });
    return;
  }
  const body = req.body ?? {};
  const bits = whole(body.bits);
  const prestigeLevel = whole(body.prestigeLevel);
  const milestoneCount = whole(body.milestoneCount, 0, 100);
  const milestoneProgress = whole(body.milestoneProgress);
  const passiveBitsBonus = whole(body.passiveBitsBonus);
  const dropsSinceMint = whole(body.dropsSinceMint, 0, 100_000);
  if (
    bits === null ||
    prestigeLevel === null ||
    milestoneCount === null ||
    milestoneProgress === null ||
    passiveBitsBonus === null ||
    dropsSinceMint === null
  ) {
    res.status(400).json({ error: "Those numbers need to be whole numbers, zero or more." });
    return;
  }
  const frameRaw = body.defaultFrameId;
  const defaultFrameId = frameRaw === null || frameRaw === "" ? null : whole(frameRaw, 0, 999);
  if (frameRaw !== null && frameRaw !== "" && defaultFrameId === null) {
    res.status(400).json({ error: "The frame needs to be a number, or empty for the server frame." });
    return;
  }
  const usernameRaw = text(body.discordUsername).toLowerCase();
  if (usernameRaw && !/^[a-z0-9._]{2,32}$/.test(usernameRaw)) {
    res.status(400).json({ error: "That Discord username doesn't look right." });
    return;
  }
  const preferred = text(body.preferredName);
  const preferredName = preferred ? sanitizePreferredName(preferred) : null;
  if (preferred && !preferredName) {
    res.status(400).json({ error: "A preferred name is one word, up to 15 letters." });
    return;
  }
  const lastGrabbed = text(body.lastGrabbedCardId);
  try {
    const player = await prisma.user.update({
      where: { id },
      data: {
        bits,
        prestigeLevel,
        milestoneCount,
        milestoneProgress,
        passiveBitsBonus,
        dropsSinceMint,
        defaultFrameId,
        discordUsername: usernameRaw || null,
        preferredName,
        lastGrabbedCardId: lastGrabbed || null,
      },
      select: { id: true },
    });
    res.json({ player });
  } catch {
    res.status(409).json({ error: "Another player already uses that Discord username." });
  }
});

adminPlayersRouter.put("/:id/buffs", async (req, res) => {
  const id = req.params["id"];
  const rows = Array.isArray(req.body?.buffs) ? req.body.buffs : null;
  if (!rows) {
    res.status(400).json({ error: "Akira needs the buff list." });
    return;
  }
  const buffs: Array<{ kind: BuffKind; expiresAt: Date; seriesId: string | null }> = [];
  for (const row of rows) {
    const kind = text(row?.kind);
    if (!BUFF_KINDS.includes(kind as BuffKind)) {
      res.status(400).json({ error: "Akira doesn't know that buff." });
      return;
    }
    const expiresAt = when(row?.expiresAt);
    if (!expiresAt) {
      res.status(400).json({ error: "Each buff needs an end time." });
      return;
    }
    const seriesKey = text(row?.seriesId);
    let seriesId: string | null = null;
    if (seriesKey) {
      const series = await prisma.series.findFirst({
        where: { OR: [{ id: seriesKey }, { slug: seriesKey.toLowerCase() }] },
        select: { id: true },
      });
      if (!series) {
        res.status(400).json({ error: "Akira couldn't find that series." });
        return;
      }
      seriesId = series.id;
    }
    buffs.push({ kind: kind as BuffKind, expiresAt, seriesId });
  }
  const kinds = new Set(buffs.map((buff) => buff.kind));
  if (kinds.size !== buffs.length) {
    res.status(400).json({ error: "A player can only hold one of each buff." });
    return;
  }
  const player = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!player) {
    res.status(404).json({ error: "Akira couldn't find that player." });
    return;
  }
  await prisma.$transaction([
    prisma.buff.deleteMany({ where: { userId: id } }),
    ...buffs.map((buff) =>
      prisma.buff.create({
        data: { userId: id, kind: buff.kind, expiresAt: buff.expiresAt, seriesId: buff.seriesId },
      }),
    ),
  ]);
  res.json({ ok: true });
});

adminPlayersRouter.put("/:id/prestige", async (req, res) => {
  const id = req.params["id"];
  const stacks: Record<(typeof PRESTIGE_KINDS)[number], number> = {
    burn: 0,
    grab: 0,
    drop: 0,
    mint: 0,
    main: 0,
  };
  for (const kind of PRESTIGE_KINDS) {
    const value = whole(req.body?.[kind], 0, 1000);
    if (value === null) {
      res.status(400).json({ error: "Prestige stacks need to be whole numbers, zero or more." });
      return;
    }
    stacks[kind] = value;
  }
  const player = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!player) {
    res.status(404).json({ error: "Akira couldn't find that player." });
    return;
  }
  await prisma.$transaction(
    PRESTIGE_KINDS.map((kind) =>
      prisma.prestigeBuff.upsert({
        where: { userId_kind: { userId: id, kind } },
        create: { userId: id, kind, stacks: stacks[kind] },
        update: { stacks: stacks[kind] },
      }),
    ),
  );
  res.json({ ok: true });
});

adminPlayersRouter.put("/:id/cooldowns", async (req, res) => {
  const id = req.params["id"];
  const player = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!player) {
    res.status(404).json({ error: "Akira couldn't find that player." });
    return;
  }
  const next: Array<{ type: CooldownType; expiresAt: Date }> = [];
  for (const type of COOLDOWN_TYPES) {
    const raw = req.body?.[type];
    if (raw === null || raw === "") continue;
    const expiresAt = when(raw);
    if (!expiresAt) {
      res.status(400).json({ error: "A cooldown needs a time, or be left empty to clear it." });
      return;
    }
    next.push({ type, expiresAt });
  }
  await prisma.$transaction([
    prisma.cooldown.deleteMany({ where: { userId: id } }),
    ...next.map((row) =>
      prisma.cooldown.create({
        data: { userId: id, type: row.type, expiresAt: row.expiresAt },
      }),
    ),
  ]);
  res.json({ ok: true });
});

adminPlayersRouter.delete("/:id", async (req, res) => {
  const id = req.params["id"];
  const player = await prisma.user.findUnique({
    where: { id },
    select: { id: true, discordId: true },
  });
  if (!player) {
    res.status(404).json({ error: "Akira couldn't find that player." });
    return;
  }
  if (player.discordId === HOST_DISCORD_ID) {
    res.status(400).json({ error: "Akira won't delete your own player record." });
    return;
  }
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
});
