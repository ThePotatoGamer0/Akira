import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSeries, searchTitle, sleep } from "./anilist.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const charactersRoot = path.join(root, "input", "characters");

type SeriesFile = {
  aliases?: string[];
  romaji?: string;
  english?: string;
};

async function resolveTitles(
  search: string,
): Promise<{ romaji: string | null; english: string | null; kind: "ANIME" | "MANGA" }> {
  let animeError: unknown;
  try {
    const anime = await resolveSeries(search, "ANIME");
    return { romaji: anime.romaji, english: anime.english, kind: "ANIME" };
  } catch (err) {
    animeError = err;
  }
  await sleep(400);
  try {
    const manga = await resolveSeries(search, "MANGA");
    return { romaji: manga.romaji, english: manga.english, kind: "MANGA" };
  } catch (err) {
    throw animeError ?? err;
  }
}

function readSeriesFile(file: string): SeriesFile {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as SeriesFile;
  } catch {
    return {};
  }
}

function writeSeriesFile(file: string, current: SeriesFile, romaji: string | null, english: string | null): void {
  const next: SeriesFile = {};
  if (Array.isArray(current.aliases) && current.aliases.length > 0) next.aliases = current.aliases;
  if (romaji) next.romaji = romaji;
  else if (current.romaji) next.romaji = current.romaji;
  if (english) next.english = english;
  else if (current.english) next.english = current.english;
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
}

async function fetchTitles(seriesSlug: string, search: string, force: boolean): Promise<boolean> {
  const file = path.join(charactersRoot, seriesSlug, "series.json");
  const current = readSeriesFile(file);
  if (!force && current.romaji && current.english) {
    console.log(`keep ${seriesSlug}`);
    return false;
  }
  console.log(`Looking up ${search} for ${seriesSlug}...`);
  const resolved = await resolveTitles(search);
  writeSeriesFile(file, current, resolved.romaji, resolved.english);
  console.log(
    `  saved ${seriesSlug} (${resolved.kind}) · ${resolved.romaji ?? "—"} / ${resolved.english ?? "—"}`,
  );
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
    if (await fetchTitles(slug, search, force)) await sleep(800);
  } catch (err) {
    console.warn(`  failed ${slug}: ${err instanceof Error ? err.message : err}`);
    await sleep(800);
  }
}
