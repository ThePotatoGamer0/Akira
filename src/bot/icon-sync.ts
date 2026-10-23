import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { discordEmojiName, ICONS, installIcons, type IconKey, type IconSpec } from "../utils/icons.js";
import { ROOT } from "../utils/paths.js";

const require = createRequire(import.meta.url);
const lucideDir = path.join(path.dirname(require.resolve("lucide-static/package.json")), "icons");
const hashFile = path.join(process.cwd(), "data", "icon-sync.json");

type RemoteEmoji = { id: string; name: string | null };
type HashFile = Record<string, string>;

function lucideInner(name: string): string {
  const file = readFileSync(path.join(lucideDir, `${name}.svg`), "utf8");
  return file
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .trim();
}

function framedSvg(inner: string, fill: boolean): string {
  const paint = fill ? `fill="#ffffff"` : `fill="none"`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="-4 -4 32 32">
  <g ${paint} stroke="#1a1225" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
  <g ${paint} stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
</svg>`;
}

function slotPng(glyph: string): Buffer {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = "700 78px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#1a1225";
  ctx.strokeText(glyph, 64, 70);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(glyph, 64, 70);
  return canvas.toBuffer("image/png");
}

/** Rasterize one catalog icon. Discord application emojis are PNG, not SVG. */
export async function renderIconPng(spec: IconSpec): Promise<Buffer> {
  if ("file" in spec) return readFileSync(path.join(ROOT, "assets", "emoji", "seek-bar", spec.file));
  if ("glyph" in spec) return slotPng(spec.glyph);
  const fill = "fill" in spec && spec.fill === true;
  const svg = framedSvg(lucideInner(spec.lucide), fill);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function readHashes(): HashFile {
  try {
    return JSON.parse(readFileSync(hashFile, "utf8")) as HashFile;
  } catch {
    return {};
  }
}

function writeHashes(hashes: HashFile): void {
  mkdirSync(path.dirname(hashFile), { recursive: true });
  writeFileSync(hashFile, `${JSON.stringify(hashes, null, 2)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discordJson(appId: string, token: string, method: string, pathname: string, body?: unknown): Promise<unknown> {
  const url = `https://discord.com/api/v10/applications/${appId}${pathname}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const init: RequestInit = {
      method,
      headers: body
        ? { Authorization: `Bot ${token}`, "Content-Type": "application/json" }
        : { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(20_000),
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(url, init);
    if (res.status === 429 && attempt < 4) {
      const text = await res.text();
      let waitMs = 1000 * (attempt + 1);
      const header = Number(res.headers.get("retry-after"));
      if (Number.isFinite(header) && header >= 0) waitMs = Math.ceil(header * 1000);
      else {
        try {
          const parsed = JSON.parse(text) as { retry_after?: unknown };
          if (typeof parsed.retry_after === "number") waitMs = Math.ceil(parsed.retry_after * 1000);
        } catch {
          // keep the backoff
        }
      }
      await sleep(Math.min(waitMs, 10_000) + 50);
      continue;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!res.ok) throw new Error(`Discord ${method} ${pathname} returned ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`Discord ${method} ${pathname} stayed rate limited.`);
}

function remoteList(payload: unknown): RemoteEmoji[] {
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; name?: unknown };
    if (typeof row.id !== "string") return [];
    return [{ id: row.id, name: typeof row.name === "string" ? row.name : null }];
  });
}

let ready: Promise<void> = Promise.resolve();
let settled = false;

/** Resolves when this process has finished an icon sync, including a failed one. */
export function whenIconsSynced(): Promise<void> {
  return ready;
}

/** True once icon sync has finished and `icon()` is using whatever Discord has. */
export function iconsAreReady(): boolean {
  return settled;
}

type InstalledIcon = { key: IconKey; id: string; name: string };

function remember(installed: InstalledIcon[], spec: IconSpec, remote: RemoteEmoji, name: string): void {
  const row = { key: spec.key, id: remote.id, name };
  const index = installed.findIndex((entry) => entry.key === spec.key);
  if (index >= 0) installed[index] = row;
  else installed.push(row);
}

/**
 * Upload any missing icons as application emojis and point `icon()` at them.
 * Safe to run on every boot: an unchanged image is left in place.
 * One picture failing does not throw away the icons that already uploaded.
 */
async function syncApplicationIconsNow(): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  const appId = process.env["DISCORD_CLIENT_ID"];
  if (!token || !appId) {
    console.warn("Skipping icon sync. DISCORD_TOKEN and DISCORD_CLIENT_ID are both required.");
    return;
  }

  console.log("Syncing application icons…");
  const listed = remoteList(await discordJson(appId, token, "GET", "/emojis"));
  console.log(`Found ${listed.length} application emojis.`);
  const byName = new Map(listed.flatMap((emoji) => (emoji.name ? [[emoji.name, emoji] as const] : [])));
  const hashes = readHashes();
  const installed: InstalledIcon[] = [];

  try {
    for (const spec of ICONS) {
      const name = discordEmojiName(spec.key);
      let remote = byName.get(name);
      try {
        const png = await renderIconPng(spec);
        const hash = createHash("sha256").update(png).digest("hex");
        const stale = Boolean(remote && hashes[name] && hashes[name] !== hash);
        if (!remote || stale) {
          if (remote && stale) {
            await discordJson(appId, token, "DELETE", `/emojis/${remote.id}`);
            byName.delete(name);
            remote = undefined;
          }
          const created = remoteList([await discordJson(appId, token, "POST", "/emojis", {
            name,
            image: `data:image/png;base64,${png.toString("base64")}`,
          })])[0];
          if (!created) throw new Error(`Discord did not return an id for ${name}.`);
          remote = created;
          byName.set(name, created);
          await sleep(400);
        }
        hashes[name] = hash;
      } catch (err) {
        console.error(`Icon ${name} did not sync.`, err instanceof Error ? err.message : err);
        if (!remote) remote = byName.get(name);
      }
      if (remote) remember(installed, spec, remote, name);
    }
  } finally {
    if (installed.length > 0) installIcons(installed);
    try {
      writeHashes(hashes);
    } catch (err) {
      console.error("Icon sync could not save its hash file.", err instanceof Error ? err.message : err);
    }
    console.log(`Synced ${installed.length} application icons.`);
  }
}

export function syncApplicationIcons(): Promise<void> {
  const run = syncApplicationIconsNow();
  ready = run.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return run;
}

if (process.argv[1]?.includes("icon-sync")) {
  syncApplicationIcons().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
