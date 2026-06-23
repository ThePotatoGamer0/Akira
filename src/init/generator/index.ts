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

export type CharacterEntry = {
  seriesSlug: string;
  characterSlug: string;
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

export function listCharacters(): CharacterEntry[] {
  if (!fs.existsSync(DIR_INPUT_CHARACTERS)) return [];
  const out: CharacterEntry[] = [];
  for (const seriesSlug of fs.readdirSync(DIR_INPUT_CHARACTERS)) {
    const seriesDir = path.join(DIR_INPUT_CHARACTERS, seriesSlug);
    if (!fs.statSync(seriesDir).isDirectory()) continue;
    for (const file of fs.readdirSync(seriesDir)) {
      if (!file.endsWith(".png")) continue;
      out.push({
        seriesSlug,
        characterSlug: path.basename(file, ".png"),
        pngPath: path.join(seriesDir, file),
      });
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
  const chars = listCharacters();
  if (frames.length === 0 || chars.length === 0) {
    console.warn("Skipping card assets: need frames in input/frames and art in input/characters.");
    return;
  }
  const total = chars.length * frames.length * 3;
  let done = 0;
  for (const c of chars) {
    for (const fr of frames) {
      const outDir = cardAssetDir(c.seriesSlug, c.characterSlug, fr.id);
      ensureDir(outDir);
      const normalPath = path.join(outDir, "normal.png");
      const shinyPath = path.join(outDir, "shiny.apng");
      const burnPath = path.join(outDir, "burn.apng");

      const normal = await renderNormalCard(c.pngPath, fr.path);
      fs.writeFileSync(normalPath, normal);
      done++;
      parseProgress(done, total, "Generating cards...");

      const shiny = await renderShinyApng(c.pngPath, fr.path);
      fs.writeFileSync(shinyPath, shiny);
      done++;
      parseProgress(done, total, "Generating cards...");

      const burn = await renderBurnApng(c.pngPath, fr.path);
      fs.writeFileSync(burnPath, burn);
      done++;
      parseProgress(done, total, "Generating cards...");
    }
  }
}

/** Minimal looping gift APNG: template until full title + showcase sequence exists. */
export async function generateGiftAnimations(): Promise<void> {
  ensureDir(DIR_ASSETS_FRAMES_GIFT);
  const frames = listFramePaths();
  const showcase: string[] = [];
  if (fs.existsSync(DIR_INPUT_SHOWCASE)) {
    for (const f of fs.readdirSync(DIR_INPUT_SHOWCASE)) {
      if (f.endsWith(".png")) showcase.push(path.join(DIR_INPUT_SHOWCASE, f));
    }
  }
  const fallbackChar = listCharacters()[0];
  const total = frames.length;
  let done = 0;
  for (const fr of frames) {
    const outPath = path.join(DIR_ASSETS_FRAMES_GIFT, `${fr.id}.apng`);
    const art =
      showcase[0] ?? fallbackChar?.pngPath;
    if (!art) {
      console.warn("Skipping gift animations: no showcase PNGs and no characters.");
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
