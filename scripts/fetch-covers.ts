import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSeries, searchTitle, sleep, writePoster } from "./anilist.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const charactersRoot = path.join(root, "input", "characters");
const seriesRoot = path.join(root, "input", "series");

async function resolveCover(search: string): Promise<{ id: number; title: string; coverUrl: string; kind: "ANIME" | "MANGA" }> {
  let animeError: unknown;
  try {
    const anime = await resolveSeries(search, "ANIME");
    if (anime.coverUrl) return { ...anime, coverUrl: anime.coverUrl, kind: "ANIME" };
  } catch (err) {
    animeError = err;
  }
  await sleep(400);
  try {
    const manga = await resolveSeries(search, "MANGA");
    if (manga.coverUrl) return { ...manga, coverUrl: manga.coverUrl, kind: "MANGA" };
  } catch (err) {
    throw animeError ?? err;
  }
  throw animeError ?? new Error(`AniList has no cover for "${search}"`);
}

async function fetchCover(seriesSlug: string, search: string, force: boolean): Promise<boolean> {
  const dest = path.join(seriesRoot, seriesSlug, "cover.png");
  if (!force && fs.existsSync(dest)) {
    console.log(`keep ${seriesSlug}`);
    return false;
  }
  console.log(`Looking up ${search} for ${seriesSlug}...`);
  const resolved = await resolveCover(search);
  await writePoster(resolved.coverUrl, dest);
  console.log(`  saved input/series/${seriesSlug}/cover.png (${resolved.title}, ${resolved.kind})`);
  await sleep(200);
  return true;
}

const force = process.argv.includes("--force");
const requested = process.argv.slice(2).filter((arg) => arg !== "--force");
const seriesSlugs =
  requested.length > 0
    ? requested
    : fs.readdirSync(charactersRoot).filter((name) => fs.statSync(path.join(charactersRoot, name)).isDirectory());

if (seriesSlugs.length === 0) {
  console.error("No series folders under input/characters.");
  process.exit(1);
}

for (const slug of seriesSlugs) {
  const search = searchTitle(slug);
  if (search === null) {
    console.log(`Skipping ${slug}: not on AniList.`);
    continue;
  }
  try {
    if (await fetchCover(slug, search, force)) await sleep(800);
  } catch (err) {
    console.warn(`  failed ${slug}: ${err instanceof Error ? err.message : err}`);
    await sleep(800);
  }
}
