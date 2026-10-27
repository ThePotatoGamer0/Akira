import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { prisma } from "../db/client.js";
import { DIR_ASSETS_CARDS, variantArtPath, type CardCacheFileName } from "../utils/paths.js";
import type { CardAnimationFormat, CardImageKind } from "./compose.js";
import {
  redrawCachedGroup,
  type CacheWorkerJob,
  type CacheWorkerResult,
  type RedrawVariant,
} from "./card-redraw.js";

const CACHE_FILES: Record<CardCacheFileName, { kind: CardImageKind; format: CardAnimationFormat; rank: number }> = {
  "normal.png": { kind: "normal", format: "gif", rank: 0 },
  "shiny.gif": { kind: "shiny", format: "gif", rank: 1 },
  "shiny.apng": { kind: "shiny", format: "apng", rank: 2 },
  "burn.gif": { kind: "burn", format: "gif", rank: 3 },
  "burn.apng": { kind: "burn", format: "apng", rank: 4 },
};

export type CachedCardFile = {
  fileName: CardCacheFileName;
  kind: CardImageKind;
  format: CardAnimationFormat;
};

export type CachedCardGroup = {
  variantId: string;
  frameId: number;
  printNumber: number | null;
  dye: string | null;
  files: CachedCardFile[];
};

export function isCardCacheFileName(name: string): name is CardCacheFileName {
  return Object.prototype.hasOwnProperty.call(CACHE_FILES, name);
}

function parsePrint(key: string): number | null | undefined {
  if (key === "preview") return null;
  const match = /^p(\d+)$/.exec(key);
  if (!match?.[1] || String(Number(match[1])) !== match[1]) return undefined;
  return Number(match[1]);
}

function parseDye(key: string): string | null | undefined {
  if (key === "none") return null;
  if (key === "custom") return undefined;
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return undefined;
  return key;
}

function directories(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => {
    try {
      return fs.statSync(path.join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Groups of card pictures already saved under the cache root. Unreadable folders are counted and left alone. */
export function listCachedCardGroups(root: string): { groups: CachedCardGroup[]; skipped: number } {
  const groups: CachedCardGroup[] = [];
  let skipped = 0;
  for (const variantId of directories(root)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(variantId)) continue;
    for (const frameName of directories(path.join(root, variantId))) {
      if (!/^\d+$/.test(frameName)) continue;
      const frameId = Number(frameName);
      if (!Number.isInteger(frameId) || String(frameId) !== frameName) continue;
      for (const printKey of directories(path.join(root, variantId, frameName))) {
        for (const dyeKey of directories(path.join(root, variantId, frameName, printKey))) {
          const folder = path.join(root, variantId, frameName, printKey, dyeKey);
          let names: string[] = [];
          try {
            names = fs.readdirSync(folder);
          } catch {
            continue;
          }
          const files = names.filter(isCardCacheFileName).sort((left, right) => CACHE_FILES[left].rank - CACHE_FILES[right].rank);
          if (files.length === 0) continue;
          const printNumber = parsePrint(printKey);
          const dye = parseDye(dyeKey);
          if (printNumber === undefined || dye === undefined) {
            skipped += files.length;
            continue;
          }
          groups.push({
            variantId,
            frameId,
            printNumber,
            dye,
            files: files.map((fileName) => ({ fileName, kind: CACHE_FILES[fileName].kind, format: CACHE_FILES[fileName].format })),
          });
        }
      }
    }
  }
  return { groups, skipped };
}

async function variantsById(ids: string[]) {
  const found = new Map<string, {
    image: string;
    character: { name: string; slug: string; series: { name: string; slug: string } };
  }>();
  if (ids.length === 0) return found;
  for (let index = 0; index < ids.length; index += 400) {
    const slice = ids.slice(index, index + 400);
    const rows = await prisma.cardVariant.findMany({
      where: { id: { in: slice } },
      include: { character: { include: { series: true } } },
    });
    for (const row of rows) found.set(row.id, row);
  }
  return found;
}

export type FarmRedrawJob = {
  id: number;
  group: CachedCardGroup;
  variant: RedrawVariant;
};

export async function collectRedrawJobs(): Promise<{ jobs: FarmRedrawJob[]; skipped: number; totalFiles: number }> {
  const listed = listCachedCardGroups(DIR_ASSETS_CARDS);
  const variants = await variantsById([...new Set(listed.groups.map((group) => group.variantId))]);
  let skipped = listed.skipped;
  const jobs: FarmRedrawJob[] = [];
  for (const group of listed.groups) {
    const variant = variants.get(group.variantId);
    const artPath = variant
      ? variantArtPath(variant.character.series.slug, variant.character.slug, variant.image)
      : null;
    if (!variant || !artPath || !fs.existsSync(artPath)) {
      skipped += group.files.length;
      continue;
    }
    jobs.push({
      id: jobs.length,
      group,
      variant: {
        image: variant.image,
        seriesSlug: variant.character.series.slug,
        characterSlug: variant.character.slug,
        characterName: variant.character.name,
        seriesName: variant.character.series.name,
      },
    });
  }
  const totalFiles = skipped + jobs.reduce((sum, job) => sum + job.group.files.length, 0);
  return { jobs, skipped, totalFiles };
}

export type RefreshProgress = { done: number; total: number };

function isTsxImport(spec: string): boolean {
  return spec === "tsx" || spec === "tsx/esm" || spec.includes("/tsx/dist/");
}

export function refreshWorkerUrl(): URL {
  const ts = new URL("./card-cache-worker.ts", import.meta.url);
  if (fs.existsSync(ts)) return ts;
  return new URL("./card-cache-worker.js", import.meta.url);
}

export function refreshWorkerExecArgv(): string[] {
  const hook = fileURLToPath(new URL("./card-cache-register.mjs", import.meta.url));
  const argv: string[] = [];
  let sawTsx = false;
  for (let index = 0; index < process.execArgv.length; index += 1) {
    const arg = process.execArgv[index] ?? "";
    if (arg === "--import" || arg === "--require") {
      const spec = process.execArgv[index + 1] ?? "";
      argv.push(arg, spec);
      if (arg === "--import" && isTsxImport(spec)) sawTsx = true;
      index += 1;
      continue;
    }
    if (arg.startsWith("--import=") || arg.startsWith("--require=")) {
      const spec = arg.slice(arg.indexOf("=") + 1);
      argv.push(arg);
      if (arg.startsWith("--import=") && isTsxImport(spec)) sawTsx = true;
    }
  }
  if (!sawTsx) argv.push("--import", "tsx");
  argv.push("--import", hook);
  return argv;
}

/** One worker per CPU, enough to keep the cores busy without stacking extra libuv pools. */
export function refreshWorkerCount(): number {
  const cpus = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(8, cpus));
}

async function redrawJob(job: FarmRedrawJob): Promise<{ redrawn: number; skipped: number }> {
  return redrawCachedGroup(job.group, job.variant);
}

async function askWorker(worker: Worker, job: FarmRedrawJob): Promise<{ redrawn: number; skipped: number }> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: CacheWorkerResult) => {
      if (message.id !== job.id) return;
      cleanup();
      if (!message.ok) {
        resolve({ redrawn: 0, skipped: job.group.files.length });
        return;
      }
      resolve({ redrawn: message.redrawn, skipped: message.skipped });
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.postMessage({ id: job.id, group: job.group, variant: job.variant } satisfies CacheWorkerJob);
  });
}

async function redrawJobs(
  jobs: FarmRedrawJob[],
  onFiles: (count: number) => void,
): Promise<{ redrawn: number; skipped: number }> {
  if (jobs.length === 0) return { redrawn: 0, skipped: 0 };

  const workers: Worker[] = [];
  try {
    const count = Math.min(refreshWorkerCount(), jobs.length);
    for (let index = 0; index < count; index += 1) {
      workers.push(new Worker(refreshWorkerUrl(), {
        execArgv: refreshWorkerExecArgv(),
        env: { ...process.env, UV_THREADPOOL_SIZE: "2" },
      }));
    }
  } catch (err) {
    console.error("Card refresh workers did not start.", err);
  }

  let cursor = 0;
  const take = () => (cursor < jobs.length ? jobs[cursor++] : undefined);
  let redrawn = 0;
  let skipped = 0;

  const run = async (draw: (job: FarmRedrawJob) => Promise<{ redrawn: number; skipped: number }>) => {
    for (;;) {
      const job = take();
      if (!job) break;
      try {
        const result = await draw(job);
        redrawn += result.redrawn;
        skipped += result.skipped;
        onFiles(result.redrawn + result.skipped);
      } catch (err) {
        console.error(`Card refresh failed for ${job.group.variantId}.`, err);
        skipped += job.group.files.length;
        onFiles(job.group.files.length);
        break;
      }
    }
  };

  try {
    if (workers.length > 0) {
      await Promise.all(workers.map((worker) => run((job) => askWorker(worker, job))));
    }
    if (cursor < jobs.length) {
      await run(redrawJob);
    }
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }

  return { redrawn, skipped };
}

/** Delete each cached picture and draw it again from the current portrait. */
export async function refreshCardCache(
  onProgress?: (progress: RefreshProgress) => void,
): Promise<{ redrawn: number; skipped: number }> {
  const collected = await collectRedrawJobs();
  const total = collected.totalFiles;
  let done = collected.skipped;
  const advance = (count: number) => {
    done += count;
    onProgress?.({ done, total });
  };
  onProgress?.({ done, total });
  const drawn = await redrawJobs(collected.jobs, advance);
  return { redrawn: drawn.redrawn, skipped: collected.skipped + drawn.skipped };
}
