import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const charactersRoot = path.join(root, "input", "characters");
const portraitsRoot = path.join(root, "input", "portraits");

type ManifestEntry = {
  slug: string;
  name: string;
  gender: string | null;
  file: string;
};

type Manifest = {
  seriesSlug: string;
  characters: ManifestEntry[];
};

function characterRecord(seriesSlug: string, entry: ManifestEntry) {
  return {
    id: `${seriesSlug}-${entry.slug}`,
    name: entry.name,
    gender: entry.gender,
    cards: [
      {
        id: `${seriesSlug}-${entry.slug}-base`,
        name: entry.name,
        rarity: "Common",
        image: "base.png",
      },
    ],
  };
}

const seriesSlugs = fs.existsSync(portraitsRoot)
  ? fs.readdirSync(portraitsRoot).filter((name) => fs.existsSync(path.join(portraitsRoot, name, "manifest.json")))
  : [];

let created = 0;
let images = 0;
let skipped = 0;

for (const seriesSlug of seriesSlugs) {
  const manifest = JSON.parse(fs.readFileSync(path.join(portraitsRoot, seriesSlug, "manifest.json"), "utf8")) as Manifest;
  for (const entry of manifest.characters) {
    const portrait = path.join(portraitsRoot, seriesSlug, entry.file);
    if (!fs.existsSync(portrait)) {
      console.warn(`missing portrait: ${seriesSlug}/${entry.file}`);
      continue;
    }

    const charDir = path.join(charactersRoot, seriesSlug, entry.slug);
    const jsonPath = path.join(charDir, "character.json");
    const imagePath = path.join(charDir, "base.png");
    fs.mkdirSync(charDir, { recursive: true });

    if (!fs.existsSync(jsonPath)) {
      fs.writeFileSync(jsonPath, JSON.stringify(characterRecord(seriesSlug, entry), null, 2) + "\n");
      created += 1;
    }

    if (!fs.existsSync(imagePath)) {
      fs.copyFileSync(portrait, imagePath);
      images += 1;
      console.log(`installed ${seriesSlug}/${entry.slug}/base.png`);
    } else {
      skipped += 1;
    }
  }
}

console.log(`Wrote ${created} character.json files, copied ${images} base.png files, left ${skipped} existing images alone.`);
