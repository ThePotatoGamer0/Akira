import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const ANILIST = "https://graphql.anilist.co";

/**
 * Folder slug to the title AniList actually lists.
 * null means the show is not on AniList, so scripts skip it.
 */
export const ANILIST_SEARCH: Record<string, string | null> = {
  "demon-slayer": "Kimetsu no Yaiba",
  evangelion: "Neon Genesis Evangelion",
  invincible: null,
  pokemon: "Pocket Monsters",
  "yarichin-bitch-club": "Yarichin☆Bitch-bu",
  "haikyuu-2nd-season": "Haikyuu!! 2nd Season",
  "hells-paradise": "Hell's Paradise",
  "howls-moving-castle": "Howl's Moving Castle",
  "cyberpunk-edgerunners": "Cyberpunk: Edgerunners",
  "pingu-in-the-city": "Pingu in the City",
  "witch-hat-atelier": "Witch Hat Atelier",
  "persona-4": "Persona 4 the Animation",
  "persona-5": "PERSONA5 the Animation",
  "sono-bisque-doll-wa-koi-wo-suru": "My Dress-Up Darling",
  "eighty-six": "86 EIGHTY-SIX",
  "ousama-ranking": "Ranking of Kings",
  "reincarnated-as-a-slime": "Tensei shitara Slime Datta Ken",
  "saiki-k": "The Disastrous Life of Saiki K.",
  "way-of-the-househusband": "The Way of the Househusband",
  "jibaku-shounen-hanako-kun": "Toilet-Bound Hanako-kun",
  "the-saga-of-tanya-the-evil": "Youjo Senki",
};

export function searchTitle(seriesSlug: string): string | null {
  if (Object.hasOwn(ANILIST_SEARCH, seriesSlug)) return ANILIST_SEARCH[seriesSlug] ?? null;
  return humanizeSlug(seriesSlug);
}

export function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(ANILIST, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "AkiraAniList/0.1",
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

const SEARCH_QUERY = `
query ($search: String, $type: MediaType) {
  Page(perPage: 10) {
    media(search: $search, type: $type, sort: SEARCH_MATCH) {
      id
      popularity
      title { romaji english }
      coverImage { extraLarge large }
    }
  }
}
`;

type MediaHit = {
  id: number;
  popularity: number | null;
  title: { romaji: string | null; english: string | null };
  coverImage: { extraLarge: string | null; large: string | null } | null;
};

function foldTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/['\u2018\u2019\u201a\u201b`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleScore(
  search: string,
  title: { romaji: string | null; english: string | null },
  popularity: number | null,
): number {
  const query = foldTitle(search);
  const names = [title.english, title.romaji].filter((name): name is string => Boolean(name)).map(foldTitle);
  let rank = 0;
  for (const name of names) {
    if (name === query) rank = Math.max(rank, 3);
    else if (name.startsWith(query)) rank = Math.max(rank, 2);
    else if (name.includes(query)) rank = Math.max(rank, 1);
  }
  return rank * 1_000_000_000 + (popularity ?? 0);
}

export async function resolveSeries(
  search: string,
  type: "ANIME" | "MANGA",
): Promise<{
  id: number;
  title: string;
  romaji: string | null;
  english: string | null;
  coverUrl: string | null;
}> {
  const data = await anilist<{ Page: { media: MediaHit[] } }>(SEARCH_QUERY, { search, type });
  const ranked = data.Page.media
    .map((hit) => ({ hit, score: titleScore(search, hit.title, hit.popularity) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 1_000_000_000) {
    throw new Error(`AniList has no ${type === "MANGA" ? "manga" : "anime"} whose title matches "${search}"`);
  }
  return {
    id: best.hit.id,
    title: best.hit.title.english ?? best.hit.title.romaji ?? search,
    romaji: best.hit.title.romaji,
    english: best.hit.title.english,
    coverUrl: best.hit.coverImage?.extraLarge ?? best.hit.coverImage?.large ?? null,
  };
}

export async function writePng(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": "AkiraAniList/0.1" } });
  if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
  const source = Buffer.from(await response.arrayBuffer());
  const png = await sharp(source).png().toBuffer();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png);
}

export async function writePoster(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": "AkiraAniList/0.1" } });
  if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
  const source = Buffer.from(await response.arrayBuffer());
  const png = await sharp(source)
    .resize(460, 690, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png);
}
