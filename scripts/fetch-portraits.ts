import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anilist, humanizeSlug, resolveSeries, searchTitle, sleep, writePng } from "./anilist.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const charactersRoot = path.join(root, "input", "characters");
const portraitsRoot = path.join(root, "input", "portraits");
const PAGE_SIZE = 25;

type ExistingCharacter = {
  slug: string;
  name: string;
  aliases: string[];
};

type AniCharacter = {
  id: number;
  name: string;
  image: string | null;
  gender: string | null;
  role: string;
};

type ManifestEntry = {
  slug: string;
  name: string;
  anilistId: number;
  role: string;
  gender: string | null;
  file: string;
  matchedCatalogSlug: string | null;
};

/** Extra AniList media whose cast should join an existing series folder. */
const EXTRA_CAST: Record<string, Array<{ type: "ANIME" | "MANGA"; search: string }>> = {
  "phantom-busters": [{ type: "MANGA", search: "Phantom Busters" }],
  "demon-slayer": [
    { type: "ANIME", search: "Kimetsu no Yaiba: Mugen Ressha-hen (TV)" },
    { type: "ANIME", search: "Kimetsu no Yaiba: Yuukaku-hen" },
    { type: "ANIME", search: "Kimetsu no Yaiba: Katanakaji no Sato-hen" },
    { type: "ANIME", search: "Kimetsu no Yaiba: Hashira Geiko-hen" },
  ],
  "jujutsu-kaisen": [
    { type: "ANIME", search: "JUJUTSU KAISEN 0" },
    { type: "ANIME", search: "JUJUTSU KAISEN Season 2" },
    { type: "ANIME", search: "JUJUTSU KAISEN Season 3: The Culling Game Part 1" },
  ],
  "chainsaw-man": [{ type: "MANGA", search: "Chainsaw Man" }],
  "my-hero-academia": [
    { type: "ANIME", search: "My Hero Academia Season 2" },
    { type: "ANIME", search: "My Hero Academia Season 3" },
    { type: "ANIME", search: "My Hero Academia Season 4" },
    { type: "ANIME", search: "My Hero Academia Season 5" },
    { type: "ANIME", search: "My Hero Academia Season 6" },
    { type: "ANIME", search: "My Hero Academia Season 7" },
    { type: "ANIME", search: "My Hero Academia FINAL SEASON" },
  ],
  "cyberpunk-edgerunners": [{ type: "ANIME", search: "Cyberpunk: Edgerunners 2" }],
};

const CAST_QUERY = `
query ($id: Int, $page: Int) {
  Media(id: $id) {
    id
    title { romaji english }
    characters(page: $page, perPage: ${PAGE_SIZE}, sort: [ROLE, RELEVANCE]) {
      pageInfo { hasNextPage currentPage }
      edges {
        role
        node {
          id
          name { full }
          gender
          image { large }
        }
      }
    }
  }
}
`;

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readExisting(seriesDir: string): ExistingCharacter[] {
  const found: ExistingCharacter[] = [];
  if (!fs.existsSync(seriesDir)) return found;
  for (const slug of fs.readdirSync(seriesDir)) {
    const jsonPath = path.join(seriesDir, slug, "character.json");
    if (!fs.existsSync(jsonPath)) continue;
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
      name?: string;
      aliases?: string[];
    };
    found.push({
      slug,
      name: data.name ?? humanizeSlug(slug),
      aliases: Array.isArray(data.aliases) ? data.aliases : [],
    });
  }
  return found;
}

function matchExisting(name: string, existing: ExistingCharacter[]): ExistingCharacter | null {
  const full = name.trim().toLowerCase();
  const exact = existing.find((character) => {
    const names = [character.name, character.slug, ...character.aliases].map((value) => value.toLowerCase());
    return names.includes(full) || names.includes(slugify(full));
  });
  if (exact) return exact;

  const parts = full.split(/\s+/);
  if (parts.length !== 1) return null;
  const first = parts[0] ?? full;
  const byFirst = existing.filter((character) => {
    const slug = character.slug.toLowerCase();
    const ownFirst = character.name.toLowerCase().split(/\s+/)[0];
    return slug === first || slug === slugify(first) || ownFirst === first;
  });
  return byFirst.length === 1 ? byFirst[0]! : null;
}

async function castFor(id: number): Promise<AniCharacter[]> {
  const characters: AniCharacter[] = [];
  let page = 1;

  while (page <= 4) {
    const data = await anilist<{
      Media: {
        characters: {
          pageInfo: { hasNextPage: boolean };
          edges: Array<{
            role: string;
            node: {
              id: number;
              name: { full: string };
              gender: string | null;
              image: { large: string | null } | null;
            };
          }>;
        };
      } | null;
    }>(CAST_QUERY, { id, page });

    if (!data.Media) {
      throw new Error(`AniList has no media with id ${id}`);
    }

    let sawBackgroundOnly = data.Media.characters.edges.length > 0;
    for (const edge of data.Media.characters.edges) {
      if (edge.role !== "MAIN" && edge.role !== "SUPPORTING") continue;
      sawBackgroundOnly = false;
      characters.push({
        id: edge.node.id,
        name: edge.node.name.full,
        image: edge.node.image?.large ?? null,
        gender: edge.node.gender,
        role: edge.role,
      });
    }
    if (!data.Media.characters.pageInfo.hasNextPage || sawBackgroundOnly) break;
    page += 1;
    await sleep(800);
  }

  return characters;
}

async function fetchSeries(seriesSlug: string, search: string, force: boolean): Promise<void> {
  const existing = readExisting(path.join(charactersRoot, seriesSlug));
  console.log(`Looking up ${search} on AniList (${existing.length} catalog characters)...`);
  const resolved = await resolveSeries(search, "ANIME");
  console.log(`  matched ${resolved.title} (${resolved.id})`);
  let characters = await castFor(resolved.id);
  const seen = new Set(characters.map((character) => character.id));
  const names = new Set(characters.map((character) => character.name.trim().toLowerCase()));
  for (const extra of EXTRA_CAST[seriesSlug] ?? []) {
    await sleep(800);
    const more = await resolveSeries(extra.search, extra.type);
    console.log(`  also ${more.title} (${more.id}, ${extra.type})`);
    for (const character of await castFor(more.id)) {
      const name = character.name.trim().toLowerCase();
      if (seen.has(character.id) || names.has(name)) continue;
      seen.add(character.id);
      names.add(name);
      characters.push(character);
    }
  }
  const outDir = path.join(portraitsRoot, seriesSlug);
  fs.mkdirSync(outDir, { recursive: true });

  const manifest: ManifestEntry[] = [];
  const usedSlugs = new Set<string>();

  for (const character of characters) {
    if (!character.image) {
      console.warn(`  no image: ${character.name}`);
      continue;
    }
    const matched = matchExisting(character.name, existing);
    let slug = matched?.slug ?? slugify(character.name);
    if (!slug) slug = `anilist-${character.id}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${character.id}`;
    usedSlugs.add(slug);

    const file = path.join(slug, "portrait.png");
    const dest = path.join(outDir, file);
    if (!force && fs.existsSync(dest)) {
      console.log(`  keep ${file}`);
    } else {
      await writePng(character.image, dest);
      console.log(`  saved ${file} (${character.role}${matched ? ", catalog match" : ""})`);
      await sleep(200);
    }
    manifest.push({
      slug,
      name: character.name,
      anilistId: character.id,
      role: character.role,
      gender: character.gender,
      file,
      matchedCatalogSlug: matched?.slug ?? null,
    });
  }

  const matched = new Set(manifest.map((entry) => entry.matchedCatalogSlug).filter(Boolean));
  const missing = existing.filter((character) => !matched.has(character.slug));
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(
      {
        seriesSlug,
        search,
        anilistId: resolved.id,
        title: resolved.title,
        note: "AniList provides one portrait per character. Alternate card arts are not filled. Move portrait.png onto base.png in input/characters when you want it in the drop pool.",
        missingFromAniList: missing.map((character) => character.slug),
        characters: manifest,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `${resolved.title}: ${manifest.length} portraits in input/portraits/${seriesSlug}. Unmatched catalog slugs: ${missing.map((character) => character.slug).join(", ") || "none"}.`,
  );
}

const force = process.argv.includes("--force");
const requested = process.argv.slice(2).filter((arg) => arg !== "--force");
const seriesSlugs = requested.length > 0
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
  await fetchSeries(slug, search, force);
}
