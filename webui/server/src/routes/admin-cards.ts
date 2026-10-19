import { Router } from "express";
import type { CardQuality } from "../../../../src/generated/prisma/client.js";
import { issuePrint } from "../../../../src/game/balance.js";
import { mintCardCode } from "../../../../src/game/codes.js";
import { prisma } from "../db/client.js";

export const adminCardsRouter = Router();

const QUALITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function whole(value: unknown, min = 0, max = 2_000_000_000): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function qualityOf(value: unknown): CardQuality | null {
  const name = text(value).toUpperCase();
  return QUALITIES.includes(name as CardQuality) ? (name as CardQuality) : null;
}

function optionalText(value: unknown): string | null {
  const raw = text(value);
  return raw || null;
}

const cardInclude = {
  owner: { select: { id: true, discordId: true, discordUsername: true, preferredName: true } },
  variant: {
    include: {
      character: { include: { series: { select: { name: true, slug: true } } } },
    },
  },
} as const;

function presentCard(card: {
  id: string;
  printNumber: number;
  quality: CardQuality;
  frameId: number | null;
  tag: string | null;
  alias: string | null;
  dye: string | null;
  obtainedAt: Date;
  variantId: string;
  owner: { id: string; discordId: string; discordUsername: string | null; preferredName: string | null } | null;
  variant: {
    id: string;
    name: string;
    rarity: string;
    character: { name: string; slug: string; series: { name: string; slug: string } };
  };
}) {
  return {
    id: card.id,
    printNumber: card.printNumber,
    quality: card.quality,
    frameId: card.frameId,
    tag: card.tag,
    alias: card.alias,
    dye: card.dye,
    obtainedAt: card.obtainedAt.toISOString(),
    variantId: card.variantId,
    variantName: card.variant.name,
    rarity: card.variant.rarity,
    characterName: card.variant.character.name,
    seriesName: card.variant.character.series.name,
    owner: card.owner,
  };
}

async function resolveOwner(raw: unknown): Promise<{ id: string } | null | "missing"> {
  const name = text(raw);
  if (!name) return null;
  if (/^\d{5,22}$/.test(name)) {
    const byId = await prisma.user.findUnique({ where: { discordId: name }, select: { id: true } });
    return byId ?? "missing";
  }
  const byName = await prisma.user.findFirst({
    where: { discordUsername: name.toLowerCase() },
    select: { id: true },
  });
  return byName ?? "missing";
}

adminCardsRouter.get("/variants", async (req, res) => {
  const q = text(req.query["q"]).toLowerCase();
  const variants = await prisma.cardVariant.findMany({
    where: q
      ? {
          OR: [
            { id: { contains: q } },
            { name: { contains: q } },
            { character: { name: { contains: q } } },
            { character: { slug: { contains: q } } },
            { character: { series: { name: { contains: q } } } },
          ],
        }
      : {},
    include: { character: { include: { series: { select: { name: true } } } } },
    orderBy: [{ character: { name: "asc" } }, { name: "asc" }],
    take: 30,
  });
  res.json({
    variants: variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      rarity: variant.rarity,
      characterName: variant.character.name,
      seriesName: variant.character.series.name,
    })),
  });
});

adminCardsRouter.get("/", async (req, res) => {
  const q = text(req.query["q"]).toLowerCase();
  const cards = await prisma.card.findMany({
    where: q
      ? {
          OR: [
            { id: { contains: q } },
            { variant: { character: { name: { contains: q } } } },
            { variant: { name: { contains: q } } },
            { owner: { discordUsername: { contains: q } } },
            { owner: { discordId: { contains: q } } },
          ],
        }
      : {},
    include: cardInclude,
    orderBy: { obtainedAt: "desc" },
    take: 40,
  });
  res.json({ cards: cards.map(presentCard) });
});

adminCardsRouter.get("/:id", async (req, res) => {
  const card = await prisma.card.findUnique({
    where: { id: req.params["id"] },
    include: cardInclude,
  });
  if (!card) {
    res.status(404).json({ error: "Akira couldn't find that card." });
    return;
  }
  res.json({ card: presentCard(card) });
});

adminCardsRouter.post("/", async (req, res) => {
  const variantId = text(req.body?.variantId);
  const quality = qualityOf(req.body?.quality);
  if (!variantId || !quality) {
    res.status(400).json({ error: "Akira needs a variant and a quality." });
    return;
  }
  const variant = await prisma.cardVariant.findUnique({ where: { id: variantId }, select: { id: true } });
  if (!variant) {
    res.status(404).json({ error: "Akira couldn't find that edition." });
    return;
  }
  const owner = await resolveOwner(req.body?.owner);
  if (owner === "missing") {
    res.status(404).json({ error: "Akira couldn't find that owner." });
    return;
  }
  const requestedPrint = req.body?.printNumber === "" || req.body?.printNumber == null ? null : whole(req.body?.printNumber, 1);
  if (req.body?.printNumber !== "" && req.body?.printNumber != null && requestedPrint === null) {
    res.status(400).json({ error: "The print number needs to be 1 or more." });
    return;
  }
  const frameRaw = req.body?.frameId;
  const frameId = frameRaw === null || frameRaw === "" || frameRaw === undefined ? null : whole(frameRaw, 0, 999);
  if (frameRaw !== null && frameRaw !== "" && frameRaw !== undefined && frameId === null) {
    res.status(400).json({ error: "The frame needs to be a number, or empty for the server frame." });
    return;
  }

  const card = await prisma.$transaction(async (tx) => {
    let printNumber = requestedPrint;
    if (printNumber === null) {
      await tx.printCounter.upsert({
        where: { variantId },
        create: { variantId, nextPrint: 1 },
        update: {},
      });
      const counter = await tx.printCounter.update({
        where: { variantId },
        data: { nextPrint: { increment: 1 } },
      });
      printNumber = issuePrint(counter.nextPrint - 1).printNumber;
    }
    const id = await mintCardCode(async (code) => {
      const existing = await tx.card.findUnique({ where: { id: code }, select: { id: true } });
      return existing !== null;
    });
    return tx.card.create({
      data: {
        id,
        variantId,
        printNumber,
        quality,
        ownerId: owner?.id ?? null,
        frameId,
        dye: optionalText(req.body?.dye),
        tag: optionalText(req.body?.tag),
        alias: optionalText(req.body?.alias),
      },
      include: cardInclude,
    });
  });
  res.status(201).json({ card: presentCard(card) });
});

adminCardsRouter.patch("/:id", async (req, res) => {
  const id = req.params["id"] ?? "";
  const existing = await prisma.card.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    res.status(404).json({ error: "Akira couldn't find that card." });
    return;
  }
  const quality = qualityOf(req.body?.quality);
  const printNumber = whole(req.body?.printNumber, 1);
  if (!quality || printNumber === null) {
    res.status(400).json({ error: "Akira needs a quality and a print number." });
    return;
  }
  const variantId = text(req.body?.variantId);
  if (variantId) {
    const variant = await prisma.cardVariant.findUnique({ where: { id: variantId }, select: { id: true } });
    if (!variant) {
      res.status(404).json({ error: "Akira couldn't find that edition." });
      return;
    }
  }
  const owner = await resolveOwner(req.body?.owner);
  if (owner === "missing") {
    res.status(404).json({ error: "Akira couldn't find that owner." });
    return;
  }
  const frameRaw = req.body?.frameId;
  const frameId = frameRaw === null || frameRaw === "" ? null : whole(frameRaw, 0, 999);
  if (frameRaw !== null && frameRaw !== "" && frameId === null) {
    res.status(400).json({ error: "The frame needs to be a number, or empty for the server frame." });
    return;
  }
  const card = await prisma.card.update({
    where: { id },
    data: {
      quality,
      printNumber,
      frameId,
      dye: optionalText(req.body?.dye),
      tag: optionalText(req.body?.tag),
      alias: optionalText(req.body?.alias),
      ownerId: owner?.id ?? null,
      ...(variantId ? { variantId } : {}),
    },
    include: cardInclude,
  });
  res.json({ card: presentCard(card) });
});

adminCardsRouter.delete("/:id", async (req, res) => {
  const id = req.params["id"] ?? "";
  const existing = await prisma.card.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    res.status(404).json({ error: "Akira couldn't find that card." });
    return;
  }
  await prisma.$transaction([
    prisma.user.updateMany({ where: { lastGrabbedCardId: id }, data: { lastGrabbedCardId: null } }),
    prisma.card.delete({ where: { id } }),
  ]);
  res.json({ ok: true });
});
