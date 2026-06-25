import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DIR_ASSETS_CARDS,
  DIR_ASSETS_FRAMES_GIFT,
  DIR_INPUT_CHARACTERS,
  DIR_INPUT_FRAMES,
  DIR_INPUT_SHOWCASE,
  cardAssetDir,
  ensureDir,
} from "../../utils/paths.js";
import { renderBurnApng, renderShinyApng } from "../../renderer/card-animations.js";
import { renderNormalCard } from "../../renderer/composite-static.js";
import { encodeApng } from "../../utils/apng.js";
import { pngBufferToRgba } from "../../renderer/frames-to-rgba.js";
import sharp from "sharp";

export type CardVariantJson = {
  id: string;
  name: string;
  rarity: string;
  image: string;
};

export type CharacterJsonData = {
  id: string;
  name: string;
  aliases?: string[];
  description?: string;
  gender?: string;
  cards: CardVariantJson[];
};

export type VariantAssetEntry = {
  seriesSlug: string;
  characterSlug: string;
  variantId: string;
  pngPath: string;
};

function listFramePaths(): { id: number; path: string }[] {
  if (!fs.existsSync(DIR_INPUT_FRAMES)) return [];
  const out: { id: number; path: string }[] = [];
  for (const name of fs.readdirSync(DIR_INPUT_FRAMES)) {
    const m = /^frame_(\d+)\.png$/i.exec(name);
    if (!m) continue;
    out.push({ id: Number(m[1]), path: path.join(DIR_INPUT_FRAMES, name) });
  }
  return out.sort((a, b) => a.id - b.id);
}

export function listVariantAssets(): VariantAssetEntry[] {
  if (!fs.existsSync(DIR_INPUT_CHARACTERS)) return [];
  const out: VariantAssetEntry[] = [];

  for (const seriesSlug of fs.readdirSync(DIR_INPUT_CHARACTERS)) {
    const seriesDir = path.join(DIR_INPUT_CHARACTERS, seriesSlug);
    if (!fs.statSync(seriesDir).isDirectory()) continue;

    for (const characterSlug of fs.readdirSync(seriesDir)) {
      const charDir = path.join(seriesDir, characterSlug);
      if (!fs.statSync(charDir).isDirectory()) continue;

      const jsonPath = path.join(charDir, "character.json");
      if (!fs.existsSync(jsonPath)) continue;

      try {
        const data: CharacterJsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        for (const card of data.cards) {
          const pngPath = path.join(charDir, card.image);
          if (fs.existsSync(pngPath)) {
            out.push({
              seriesSlug,
              characterSlug,
              variantId: card.id,
              pngPath,
            });
          }
        }
      } catch (err) {
        console.error(`Failed to parse metadata at ${jsonPath}:`, err);
      }
    }
  }
  return out;
}

function parseProgress(done: number, total: number, label: string): void {
  process.stdout.write(`\r${label} ${done}/${total}`);
  if (done === total) process.stdout.write("\n");
}

export async function generateAllCardAssets(): Promise<void> {
  ensureDir(DIR_ASSETS_CARDS);
  const frames = listFramePaths();
  const variants = listVariantAssets();
  if (frames.length === 0 || variants.length === 0) {
    console.warn("Skipping card assets: need frames in input/frames and art variation files configured via character.json templates.");
    return;
  }
  const total = variants.length * frames.length * 3;
  let done = 0;
  for (const v of variants) {
    for (const fr of frames) {
      // Directs outputs using variant IDs instead of global layout blocks
      const outDir = cardAssetDir(v.seriesSlug, `${v.characterSlug}-${v.variantId}`, fr.id);
      ensureDir(outDir);
      const normalPath = path.join(outDir, "normal.png");
      const shinyPath = path.join(outDir, "shiny.apng");
      const burnPath = path.join(outDir, "burn.apng");

      const normal = await renderNormalCard(v.pngPath, fr.path);
      fs.writeFileSync(normalPath, normal);
      done++;
      parseProgress(done, total, "Generating cards...");

      const shiny = await renderShinyApng(v.pngPath, fr.path);
      fs.writeFileSync(shinyPath, shiny);
      done++;
      parseProgress(done, total, "Generating cards...");

      const burn = await renderBurnApng(v.pngPath, fr.path);
      fs.writeFileSync(burnPath, burn);
      done++;
      parseProgress(done, total, "Generating cards...");
    }
  }
}

export async function generateGiftAnimations(): Promise<void> {
  ensureDir(DIR_ASSETS_FRAMES_GIFT);
  const frames = listFramePaths();
  const showcase: string[] = [];
  if (fs.existsSync(DIR_INPUT_SHOWCASE)) {
    for (const f of fs.readdirSync(DIR_INPUT_SHOWCASE)) {
      if (f.endsWith(".png")) showcase.push(path.join(DIR_INPUT_SHOWCASE, f));
    }
  }
  const fallbackVariant = listVariantAssets()[0];
  const total = frames.length;
  let done = 0;
  for (const fr of frames) {
    const outPath = path.join(DIR_ASSETS_FRAMES_GIFT, `${fr.id}.apng`);
    const art = showcase[0] ?? fallbackVariant?.pngPath;
    if (!art) {
      console.warn("Skipping gift animations: no showcase PNGs and no character variants.");
      return;
    }
    const card = await renderNormalCard(art, fr.path);
    const meta = await sharp(card).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) throw new Error("gift: bad dimensions");
    const a = await pngBufferToRgba(card, w, h);
    const b = await pngBufferToRgba(await sharp(card).linear(1.05, -8).png().toBuffer(), w, h);
    const apng = encodeApng([a, b], w, h, [400, 400]);
    fs.writeFileSync(outPath, apng);
    done++;
    parseProgress(done, total, "Generating Akira's Gift APNGs...");
  }
}

export async function runGenerator(): Promise<void> {
  await generateAllCardAssets();
  await generateGiftAnimations();
}

const isCliEntry = Boolean(
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url,
);
if (isCliEntry) {
  await runGenerator();
}