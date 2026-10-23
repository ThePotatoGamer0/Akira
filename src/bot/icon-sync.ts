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

async function discordJson(appId: string, token: string, method: string, pathname: string, body?: unknown): Promise<unknown> {
  const init: RequestInit = {
    method,
    headers: body
      ? { Authorization: `Bot ${token}`, "Content-Type": "application/json" }
      : { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(20_000),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`https://discord.com/api/v10/applications/${appId}${pathname}`, init);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`Discord ${method} ${pathname} returned ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
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

/**
 * Upload any missing Lucide icons as application emojis and point `icon()` at them.
 * Safe to run on every boot: an unchanged image is left in place.
 */
export async function syncApplicationIcons(): Promise<void> {
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
  const installed: { key: IconKey; id: string; name: string }[] = [];

  for (const spec of ICONS) {
    const name = discordEmojiName(spec.key);
    const png = await renderIconPng(spec);
    const hash = createHash("sha256").update(png).digest("hex");
    let remote = byName.get(name);
    if (remote && hashes[name] && hashes[name] !== hash) {
      await discordJson(appId, token, "DELETE", `/emojis/${remote.id}`);
      byName.delete(name);
      remote = undefined;
    }
    if (!remote) {
      const created = remoteList([await discordJson(appId, token, "POST", "/emojis", {
        name,
        image: `data:image/png;base64,${png.toString("base64")}`,
      })])[0];
      if (!created) throw new Error(`Discord did not return an id for ${name}.`);
      remote = created;
      byName.set(name, created);
    }
    hashes[name] = hash;
    installed.push({ key: spec.key, id: remote.id, name });
  }

  writeHashes(hashes);
  installIcons(installed);
  console.log(`Synced ${installed.length} application icons.`);
}

if (process.argv[1]?.includes("icon-sync")) {
  syncApplicationIcons().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
