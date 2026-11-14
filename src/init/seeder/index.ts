import fs from "node:fs";
import path from "node:path";
import { DIR_ASSETS_CARDS, DIR_INPUT_CHARACTERS, cardCacheDir } from "../../utils/paths.js";
import { prisma } from "../../db/client.js";
import { displaySeriesName } from "../../game/series-meta.js";
import { writeJournal } from "./journal.js";
import type { CharacterJsonData } from "../generator/index.js";

export async function seedCatalog(): Promise<void> {
  if (!fs.existsSync(DIR_INPUT_CHARACTERS)) return;

  for (const seriesSlug of fs.readdirSync(DIR_INPUT_CHARACTERS)) {
    const seriesDir = path.join(DIR_INPUT_CHARACTERS, seriesSlug);
    if (!fs.statSync(seriesDir).isDirectory()) continue;

    // 1. Upsert the Series using the directory name slug
    const series = await prisma.series.upsert({
      where: { slug: seriesSlug },
      create: { name: seriesTitle(seriesSlug), slug: seriesSlug },
      update: {},
    });

    // 2. Loop over character subdirectories inside the series
    for (const characterSlug of fs.readdirSync(seriesDir)) {
      const charDir = path.join(seriesDir, characterSlug);
      if (!fs.statSync(charDir).isDirectory()) continue;

      const jsonPath = path.join(charDir, "character.json");
      if (!fs.existsSync(jsonPath)) continue;

      try {
        const data: CharacterJsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

        // 3. Upsert the Base Character details
        const character = await prisma.character.upsert({
          where: {
            seriesId_slug: { seriesId: series.id, slug: characterSlug },
          },
          create: {
            name: data.name,
            slug: characterSlug,
            seriesId: series.id,
            description: data.description ?? null,
            gender: data.gender ?? null,
            role: data.role ?? null,
            aliases: data.aliases ? JSON.stringify(data.aliases) : null,
          },
          update: {
            name: data.name,
            description: data.description ?? null,
            gender: data.gender ?? null,
            role: data.role ?? null,
            aliases: data.aliases ? JSON.stringify(data.aliases) : null,
          },
        });

        // 4. Upsert all specific variants template cards tied to this character
        for (const card of data.cards) {
          await prisma.cardVariant.upsert({
            where: { id: card.id },
            create: {
              id: card.id,
              characterId: character.id,
              name: card.name,
              rarity: card.rarity,
              image: card.image,
            },
            update: {
              characterId: character.id,
              name: card.name,
              rarity: card.rarity,
              image: card.image,
            },
          });
        }
      } catch (err) {
        console.error(`Failed to seed catalog from configuration file at ${jsonPath}:`, err);
      }
    }
  }

  await syncCatalog();
}

/**
 * Delete every edition, character and series that input/ no longer has. Deleting the files
 * is the whole edit: a card keeps the id it was minted from, so claimed copies stay owned
 * while their edition is forgotten, and nothing is drawn in the catalog for them.
 */
export async function syncCatalog(): Promise<void> {
  const series = await prisma.series.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      characters: {
        select: {
          id: true,
          name: true,
          slug: true,
          variants: { select: { id: true, name: true, rarity: true } },
        },
      },
    },
  });

  const keptVariants = new Set<string>();
  const keptCharacters = new Set<string>();
  const seriesDirs = new Set(readDirs(DIR_INPUT_CHARACTERS));
  // An empty input/ would match nothing and delete the whole catalog. Refuse that.
  if (seriesDirs.size === 0) {
    console.warn("Catalog sync skipped: input/characters has no series directories.");
    return;
  }
  for (const row of series) {
    const seriesDir = path.join(DIR_INPUT_CHARACTERS, row.slug);
    if (!seriesDirs.has(row.slug)) continue;
    for (const characterSlug of readDirs(seriesDir)) {
      const cards = readCards(path.join(seriesDir, characterSlug, "character.json"));
      if (!cards) continue;
      keptCharacters.add(`${row.id}\u0000${characterSlug}`);
      for (const card of cards) keptVariants.add(card.id);
    }
  }

  const removed = series.flatMap((row) =>
    row.characters.flatMap((character) =>
      character.variants
        .filter((variant) => !keptVariants.has(variant.id))
        .map((variant) => ({
          variantId: variant.id,
          characterName: character.name,
          variantName: variant.name,
          seriesName: row.name,
          rarity: variant.rarity,
        })),
    ),
  );
  const removedCharacters = series.flatMap((row) =>
    row.characters
      .filter((character) => !keptCharacters.has(`${row.id}\u0000${character.slug}`))
      .map((character) => character.id),
  );
  const removedSeries = series.filter((row) => !seriesDirs.has(row.slug)).map((row) => row.id);

  if (removed.length === 0 && removedCharacters.length === 0 && removedSeries.length === 0) return;

  const variantIds = removed.map((row) => row.variantId);
  const dropped = await prisma.card.findMany({
    where: { variantId: { in: variantIds }, OR: [{ ownerId: null }, { dropSlot: { isNot: null } }] },
    select: { id: true },
  });

  await prisma.transferOffer.deleteMany({
    where: {
      status: "pending",
      OR: [{ fromCardId: { in: dropped.map((card) => card.id) } }, { toCardId: { in: dropped.map((card) => card.id) } }],
    },
  });
  // Unclaimed copies go with the edition. Claimed ones stay owned and just stop pointing at it.
  const freed = dropped.map((card) => card.id);
  if (freed.length > 0) await prisma.card.deleteMany({ where: { id: { in: freed } } });

  const kept = await prisma.card.findMany({
    where: { variantId: { in: variantIds }, ownerId: { not: null } },
    select: { id: true, variantId: true, assetKey: true },
  });
  for (const card of kept) {
    await prisma.card.update({
      where: { id: card.id },
      data: { assetKey: card.assetKey ?? card.variantId, variantId: null },
    });
  }

  const removedRows = await prisma.removedCard.findMany({
    where: { variantId: { in: variantIds } },
    select: { variantId: true },
  });
  const alreadyKnown = new Set(removedRows.map((row) => row.variantId));
  await prisma.removedCard.createMany({
    data: removed.map((row) => ({
      variantId: row.variantId,
      characterName: row.characterName,
      variantName: row.variantName,
      seriesName: row.seriesName,
      rarity: row.rarity,
      cacheFolder: path.relative(DIR_ASSETS_CARDS, cardCacheDir(row.variantId)),
    })),
  });
  // One note per deletion, so the changelog says when it happened and nothing about the fleet:
  // deploy runs every machine's sync, and the freed pictures are deleted from disk either way.
  for (const row of removed) {
    if (alreadyKnown.has(row.variantId)) continue;
    await writeJournal(`${row.characterName} — ${row.variantName}`);
  }

  await prisma.cardVariant.deleteMany({ where: { id: { in: variantIds } } });
  await prisma.character.deleteMany({ where: { id: { in: removedCharacters } } });
  await prisma.series.deleteMany({ where: { id: { in: removedSeries } } });

  for (const id of variantIds) fs.rmSync(cardCacheDir(id), { recursive: true, force: true });
  console.log(
    `Catalog sync: removed ${removed.length} edition(s), ${removedCharacters.length} character(s), ${removedSeries.length} series.`,
  );
}

function readDirs(dir: string): string[] {
  return fs.readdirSync(dir).filter((name) => {
    try {
      return fs.statSync(path.join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** The cards a character.json lists, or null when the file is missing or cannot be read. */
function readCards(jsonPath: string): CharacterJsonData["cards"] | null {
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as CharacterJsonData;
    return Array.isArray(data.cards) ? data.cards : [];
  } catch {
    return null;
  }
}

const SERIES_TITLES: Record<string, string> = {
  "pingu-in-the-city": "Pingu in the City",
  "witch-hat-atelier": "Witch Hat Atelier",
  "persona-4": "Persona 4",
  "persona-5": "Persona 5",
  "the-saga-of-tanya-the-evil": "The Saga of Tanya the Evil",
};

function seriesTitle(slug: string): string {
  return displaySeriesName(slug, SERIES_TITLES[slug] ?? humanizeSlug(slug), "romaji");
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
