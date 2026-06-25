import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../db/client.js";
import { DIR_INPUT_CHARACTERS } from "../../utils/paths.js";
import type { CharacterJsonData } from "../generator/index.js";

export async function seedCatalog(): Promise<void> {
  if (!fs.existsSync(DIR_INPUT_CHARACTERS)) return;

  for (const seriesSlug of fs.readdirSync(DIR_INPUT_CHARACTERS)) {
    const seriesDir = path.join(DIR_INPUT_CHARACTERS, seriesSlug);
    if (!fs.statSync(seriesDir).isDirectory()) continue;

    // 1. Upsert the Series using the directory name slug
    const series = await prisma.series.upsert({
      where: { slug: seriesSlug },
      create: { name: humanizeSlug(seriesSlug), slug: seriesSlug },
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
            aliases: data.aliases ? JSON.stringify(data.aliases) : null,
          },
          update: {
            name: data.name,
            description: data.description ?? null,
            gender: data.gender ?? null,
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
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}