import { prisma } from "../../db/client.js";
import { listCharacters } from "../generator/index.js";

export async function seedCatalog(): Promise<void> {
  const entries = listCharacters();
  for (const e of entries) {
    const series = await prisma.series.upsert({
      where: { slug: e.seriesSlug },
      create: { name: humanizeSlug(e.seriesSlug), slug: e.seriesSlug },
      update: {},
    });
    await prisma.character.upsert({
      where: {
        seriesId_slug: { seriesId: series.id, slug: e.characterSlug },
      },
      create: {
        name: humanizeSlug(e.characterSlug),
        slug: e.characterSlug,
        seriesId: series.id,
      },
      update: {
        name: humanizeSlug(e.characterSlug),
      },
    });
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
