import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const charactersRoot = path.join(root, "input", "characters");
const portraitsRoot = path.join(root, "input", "portraits");

const ANILIST = "https://graphql.anilist.co";
const PAGE_SIZE = 25;

/**
 * Folder slug to the title AniList actually lists.
 * null means the show is not on AniList, so the script skips it.
 */
const ANILIST_SEARCH: Record<string, string | null> = {
  "demon-slayer": "Kimetsu no Yaiba",
  invincible: null,
  pokemon: "Pocket Monsters",
  "yarichin-bitch-club": "Yarichin☆Bitch-bu",
  "haikyuu-2nd-season": "Haikyuu!! 2nd Season",
  "cyberpunk-edgerunners": "Cyberpunk: Edgerunners",
  "pingu-in-the-city": "Pingu in the City",
  "witch-hat-atelier": "Witch Hat Atelier",
};

function searchTitle(seriesSlug: string): string | null {
  if (Object.hasOwn(ANILIST_SEARCH, seriesSlug)) return ANILIST_SEARCH[seriesSlug] ?? null;
  return humanizeSlug(seriesSlug);
}

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

const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 10) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      popularity
      title { romaji english }
    }
  }
}
`;

const CAST_QUERY = `
query ($id: Int, $page: Int) {
  Media(id: $id, type: ANIME) {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

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

  const first = full.split(/\s+/)[0] ?? full;
  const byFirst = existing.filter((character) => {
    const slug = character.slug.toLowerCase();
    const ownFirst = character.name.toLowerCase().split(/\s+/)[0];
    return slug === first || slug === slugify(first) || ownFirst === first;
  });
  return byFirst.length === 1 ? byFirst[0]! : null;
}

async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(ANILIST, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "AkiraPortraitFetch/0.1",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "2");
      await sleep((Number.isFinite(retryAfter) ? retryAfter : 2) * 1000);
      continue;
    }
    if (!response.ok) {
      throw new Error(`AniList responded ${response.status}`);
    }
    const body = (await response.json()) as { data?: T; errors?: unknown };
    if (body.errors) {
      throw new Error(`AniList query failed: ${JSON.stringify(body.errors)}`);
    }
    if (!body.data) throw new Error("AniList returned no data");
    return body.data;
  }
  throw new Error("AniList rate limit persisted");
}

function titleScore(
  search: string,
  title: { romaji: string | null; english: string | null },
  popularity: number | null,
): number {
  const query = search.toLowerCase();
  const names = [title.english, title.romaji].filter((name): name is string => Boolean(name)).map((name) => name.toLowerCase());
  let rank = 0;
  for (const name of names) {
    if (name === query) rank = Math.max(rank, 3);
    else if (name.startsWith(query)) rank = Math.max(rank, 2);
    else if (name.includes(query)) rank = Math.max(rank, 1);
  }
  return rank * 1_000_000_000 + (popularity ?? 0);
}

async function resolveSeries(search: string): Promise<{ id: number; title: string }> {
  const data = await anilist<{
    Page: {
      media: Array<{
        id: number;
        popularity: number | null;
        title: { romaji: string | null; english: string | null };
      }>;
    };
  }>(SEARCH_QUERY, { search });
  const ranked = data.Page.media
    .map((hit) => ({ hit, score: titleScore(search, hit.title, hit.popularity) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 1_000_000_000) {
    throw new Error(`AniList has no anime whose title matches "${search}"`);
  }
  return {
    id: best.hit.id,
    title: best.hit.title.english ?? best.hit.title.romaji ?? search,
  };
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
      throw new Error(`AniList has no anime with id ${id}`);
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

async function writePng(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": "AkiraPortraitFetch/0.1" } });
  if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
  const source = Buffer.from(await response.arrayBuffer());
  const png = await sharp(source).png().toBuffer();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png);
}

async function fetchSeries(seriesSlug: string, search: string, force: boolean): Promise<void> {
  const existing = readExisting(path.join(charactersRoot, seriesSlug));
  console.log(`Looking up ${search} on AniList (${existing.length} catalog characters)...`);
  const resolved = await resolveSeries(search);
  console.log(`  matched ${resolved.title} (${resolved.id})`);
  const characters = await castFor(resolved.id);
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
