import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { prisma } from "../db/client.js";
import type { CardImageRequest } from "../game/compose.js";
import { utcDay } from "../game/buffs.js";
import {
  DROP_SHAPES,
  dropShapeKey,
  effectsForShape,
  pityKeepsQualities,
  shelfDepthForKey,
  type DropShape,
} from "../game/drop-stock.js";
import { rollFreshSlots, type PresentedSlot } from "../game/drops.js";
import { displayFrameId, serverDefaultFrame } from "../game/frames.js";
import { parseServerBuffs } from "../game/live-buffs.js";
import { FEATURED_ART_DEPTH, pickFeatured, type FeaturedCandidate } from "../game/featured.js";
import { seriesTrackedBy } from "../game/stats.js";
import { isInitLocked } from "../utils/init-lock.js";
import { loadFrame } from "../utils/frames.js";

const PLAIN_DEPTH = 2;
/** Only this often does a series whose art is not drawn yet get reported. */
const THIN_FEATURED_NOTE_MS = 60 * 60 * 1000;
let thinFeaturedAt = 0;

function reportThinFeatured(seriesId: string, pictures: number): void {
  const now = Date.now();
  if (now - thinFeaturedAt < THIN_FEATURED_NOTE_MS) return;
  thinFeaturedAt = now;
  console.warn(`Featured drop leans on ${seriesId}, which has only ${pictures} picture(s) drawn. Run the farm to fill it in.`);
}

export type ShelvedDrop = {
  key: string;
  slots: PresentedSlot[];
  strip: Buffer;
  animated: boolean;
};

type ShelfJob =
  | { id: number; kind: "strip"; key: string; slots: PresentedSlot[] }
  | { id: number; kind: "burn"; request: CardImageRequest };

const queues = new Map<string, ShelvedDrop[]>();
let worker: Worker | null = null;
let jobId = 0;
let busy = false;
let shelfPaused = false;
let started = false;
let timer: NodeJS.Timeout | null = null;
let pendingBurn: { cardId: string; guildId: string | null } | null = null;

export function takeDrop(shape: DropShape, dropsSinceMint: number): ShelvedDrop | null {
  const queue = queues.get(dropShapeKey(shape));
  if (!queue) return null;
  const index = queue.findIndex((item) =>
    pityKeepsQualities(
      dropsSinceMint,
      item.slots.map((slot) => slot.quality),
    ),
  );
  if (index < 0) return null;
  const [next] = queue.splice(index, 1);
  if (!next) return null;
  wake(50);
  return {
    key: next.key,
    strip: next.strip,
    animated: next.animated,
    slots: next.slots.map((slot) => ({ ...slot })),
  };
}

export function restoreDrop(item: ShelvedDrop): void {
  const queue = queues.get(item.key) ?? [];
  if (queue.length >= shelfDepthForKey(item.key)) return;
  queue.unshift({
    key: item.key,
    strip: item.strip,
    animated: item.animated,
    slots: item.slots.map((slot) => ({ ...slot })),
  });
  queues.set(item.key, queue);
}

export function queueBurnWarm(cardId: string, guildId: string | null): void {
  pendingBurn = { cardId, guildId };
  wake(50);
}

export function startDropShelf(): void {
  if (started) return;
  started = true;
  wake(5_000);
}

function wake(delayMs: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void tick();
  }, delayMs);
  timer.unref?.();
}

export function workerUrl(): URL {
  const ts = new URL("./drop-shelf-worker.ts", import.meta.url);
  if (fs.existsSync(ts)) return ts;
  return new URL("./drop-shelf-worker.js", import.meta.url);
}

function isTsxImport(spec: string): boolean {
  return spec === "tsx" || spec === "tsx/esm" || spec.includes("/tsx/dist/");
}

export function workerExecArgv(): string[] {
  const hook = fileURLToPath(new URL("./drop-shelf-register.mjs", import.meta.url));
  const argv: string[] = [];
  let sawTsx = false;
  for (let i = 0; i < process.execArgv.length; i += 1) {
    const arg = process.execArgv[i] ?? "";
    if (arg === "--import" || arg === "--require") {
      const spec = process.execArgv[i + 1] ?? "";
      argv.push(arg, spec);
      if (arg === "--import" && isTsxImport(spec)) sawTsx = true;
      i += 1;
      continue;
    }
    if (arg.startsWith("--import=") || arg.startsWith("--require=")) {
      const spec = arg.slice(arg.indexOf("=") + 1);
      argv.push(arg);
      if (arg.startsWith("--import=") && isTsxImport(spec)) sawTsx = true;
    }
  }
  // Node 22 strips types in the worker and does not install tsx on its own.
  // The register hook has to follow the tsx import or the .js specifiers stay unresolved.
  if (!sawTsx) argv.push("--import", "tsx");
  argv.push("--import", hook);
  return argv;
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(workerUrl(), { execArgv: workerExecArgv() });
  } catch (err) {
    console.error("Drop shelf worker did not start.", err);
    worker = null;
    return null;
  }
  worker.on("error", (err) => {
    console.error("Drop shelf worker stopped.", err);
    worker = null;
    busy = false;
  });
  worker.on("exit", () => {
    worker = null;
    busy = false;
    wake(1_000);
  });
  return worker;
}

async function framesInUse(): Promise<number[]> {
  const rows = await prisma.guildConfig.findMany({ select: { defaultFrameId: true } });
  const frames = new Set<number>();
  for (const row of rows) {
    const id = displayFrameId(null, row.defaultFrameId ?? 0);
    if (loadFrame(id)) frames.add(id);
  }
  if (frames.size === 0 && loadFrame(0)) frames.add(0);
  return [...frames];
}

async function shapeOrder(frameId: number): Promise<DropShape[]> {
  const pools = await prisma.serverPool.findMany({
    select: { buffExpiry: true, activeBuff: true },
  });
  const now = Date.now();
  let four = false;
  let shiny = false;
  for (const pool of pools) {
    if (!pool.buffExpiry || pool.buffExpiry.getTime() <= now) continue;
    const kinds = parseServerBuffs(pool.activeBuff);
    if (kinds.includes("four_cards")) four = true;
    if (kinds.includes("shiny_luck")) shiny = true;
  }
  const shapes = DROP_SHAPES.map((shape) => ({ ...shape, frameId, seriesId: null }));
  shapes.sort((left, right) => rank(left, four, shiny) - rank(right, four, shiny));
  return shapes;
}

function rank(shape: DropShape, four: boolean, shiny: boolean): number {
  const cardCount = four ? 4 : 3;
  const weight = shiny ? 2 : 1;
  if (!shape.qualityOverQuantity && shape.cardCount === cardCount && shape.legendaryWeight === weight) return 0;
  if (!shape.qualityOverQuantity && shape.cardCount === cardCount) return 1;
  if (!shape.qualityOverQuantity) return 2;
  return 3;
}

function prune(frames: number[]): void {
  const live = new Set(frames);
  for (const key of queues.keys()) {
    const frameId = Number(key.split(":")[0]);
    if (!live.has(frameId)) queues.delete(key);
  }
}

async function plainShapes(): Promise<DropShape[]> {
  const pools = await prisma.serverPool.findMany({ select: { activeBuff: true, buffExpiry: true } });
  const now = Date.now();
  // A tracked pull makes a strip depend on who drops it, so it cannot come off the shelf.
  const leaning = pools.some(
    (pool) => pool.buffExpiry && pool.buffExpiry.getTime() > now && parseServerBuffs(pool.activeBuff).includes("tracked_pull"),
  );
  if (leaning) return [];
  const frames = await framesInUse();
  prune(frames);
  const shapes: DropShape[] = [];
  for (const frameId of frames) shapes.push(...(await shapeOrder(frameId)));
  return shapes;
}

async function nextStrip(limit: number): Promise<{ key: string; slots: PresentedSlot[] } | null> {
  const shapes = await plainShapes();
  if (shapes.length === 0) return null;
  const shape = shapes.find((candidate) => (queues.get(dropShapeKey(candidate))?.length ?? 0) < limit);
  if (!shape) return null;
  const slots = await rollFreshSlots(effectsForShape(shape), shape.frameId);
  return { key: dropShapeKey(shape), slots };
}

/** The featured series to draw, or null when there are none. Reported when art is missing. */
async function seriesOrder(onArtMissing: (seriesId: string, pictures: number) => void): Promise<string[]> {
  const now = new Date();
  const [catalog, locked, shop] = await Promise.all([
    prisma.series.findMany({
      where: { characters: { some: { variants: { some: {} } } } },
      select: { id: true, _count: { select: { characters: true } } },
      orderBy: { slug: "asc" },
    }),
    prisma.buff.findMany({
      where: { kind: "featured_series", expiresAt: { gt: now }, NOT: { seriesId: null } },
      select: { seriesId: true },
    }),
    prisma.featuredSeries.findUnique({ where: { id: "shop" } }),
  ]);
  const catalogIds = new Set(catalog.map((row) => row.id));
  const lockedIds = new Set(locked.map((row) => row.seriesId).filter((id): id is string => id !== null && catalogIds.has(id)));
  const shopId = shop?.day === utcDay(now) && shop.seriesId && catalogIds.has(shop.seriesId) ? shop.seriesId : null;
  const byId = new Map(catalog.map((row) => [row.id, row]));
  const tracked = await seriesTrackedBy([...byId.keys()]);
  const candidates: FeaturedCandidate[] = [...byId.values()]
    .filter((row) => !lockedIds.has(row.id) && row.id !== shopId)
    .map((row) => ({ id: row.id, tracked: tracked.get(row.id) ?? 0, pictures: row._count.characters }));
  const picked = pickFeatured(candidates);
  const first: string[] = [];
  const seen = new Set<string>();
  const prefer = (id: string | null | undefined) => {
    if (!id || seen.has(id) || !catalogIds.has(id)) return;
    seen.add(id);
    first.push(id);
  };
  // A series someone bought keeps its place, and the shop's pick of the day goes next.
  for (const row of locked) prefer(row.seriesId);
  prefer(shopId);
  if (picked >= 0) {
    const chosen = candidates[picked]!;
    if (chosen.pictures < FEATURED_ART_DEPTH) onArtMissing(chosen.id, chosen.pictures);
    prefer(chosen.id);
  }
  // The rest stay only as a fallback for when the picked one already has a drop waiting.
  for (const row of catalog) prefer(row.id);
  return first;
}

async function nextFeatured(): Promise<{ key: string; slots: PresentedSlot[] } | null> {
  const seriesIds = await seriesOrder(reportThinFeatured);
  const known = new Set(seriesIds);
  for (const key of queues.keys()) {
    const seriesId = key.split(":").slice(4).join(":");
    if (seriesId && !known.has(seriesId)) queues.delete(key);
  }
  const base = await plainShapes();
  for (const seriesId of seriesIds) {
    for (const shape of base) {
      const featured: DropShape = { ...shape, seriesId };
      const key = dropShapeKey(featured);
      if ((queues.get(key)?.length ?? 0) >= 1) continue;
      const slots = await rollFreshSlots(effectsForShape(featured), featured.frameId);
      return { key, slots };
    }
  }
  return null;
}

async function burnRequest(): Promise<CardImageRequest | null> {
  const pending = pendingBurn;
  if (!pending) return null;
  pendingBurn = null;
  const card = await prisma.card.findUnique({
    where: { id: pending.cardId },
    include: {
      owner: true,
      variant: { include: { character: { include: { series: true } } } },
    },
  });
  if (!card) return null;
  return {
    variantId: card.variant.id,
    seriesSlug: card.variant.character.series.slug,
    characterSlug: card.variant.character.slug,
    imageFile: card.variant.image,
    characterName: card.variant.character.name,
    seriesName: card.variant.character.series.name,
    frameId: displayFrameId(card.frameId, await serverDefaultFrame(pending.guildId), card.owner?.defaultFrameId ?? null),
    printNumber: card.printNumber,
    dye: card.dye,
    kind: "burn",
  };
}

export class DropShelfBusyError extends Error {
  constructor() {
    super("Drop shelf stayed busy.");
    this.name = "DropShelfBusyError";
  }
}

/** Stop new shelf renders and wait until the current one finishes. */
export async function pauseDropShelf(): Promise<void> {
  shelfPaused = true;
  const deadline = Date.now() + 60_000;
  while (busy) {
    if (Date.now() > deadline) throw new DropShelfBusyError();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export function resumeDropShelf(): void {
  shelfPaused = false;
  wake(50);
}

/** Drop pre-drawn strips so the next drops use freshly redrawn cards. */
export function clearDropShelf(): void {
  queues.clear();
  pendingBurn = null;
}

function post(job: ShelfJob): void {
  if (shelfPaused || isInitLocked()) {
    wake(5_000);
    return;
  }
  const thread = ensureWorker();
  if (!thread) {
    busy = false;
    wake(30_000);
    return;
  }
  busy = true;
  const id = job.id;
  const onMessage = (message: { id?: number; ok?: boolean; kind?: string; data?: Buffer; animated?: boolean; error?: string }) => {
    if (message.id !== id) return;
    thread.off("message", onMessage);
    busy = false;
    if (message.ok && message.kind === "strip" && job.kind === "strip" && message.data) {
      const queue = queues.get(job.key) ?? [];
      if (queue.length < shelfDepthForKey(job.key)) {
        queue.push({
          key: job.key,
          slots: job.slots.map((slot) => ({ ...slot })),
          strip: Buffer.from(message.data),
          animated: message.animated === true,
        });
        queues.set(job.key, queue);
      }
    } else if (!message.ok && message.error) {
      console.error("Drop shelf render failed.", message.error);
    }
    wake(200);
  };
  thread.on("message", onMessage);
  thread.postMessage(job);
}

async function tick(): Promise<void> {
  if (busy || shelfPaused || isInitLocked()) {
    wake(shelfPaused || isInitLocked() ? 5_000 : 200);
    return;
  }
  try {
    const first = await nextStrip(1);
    if (first) {
      post({ id: ++jobId, kind: "strip", key: first.key, slots: first.slots });
      return;
    }
    if (pendingBurn) {
      const request = await burnRequest();
      if (request) {
        post({ id: ++jobId, kind: "burn", request });
        return;
      }
    }
    const extra = await nextStrip(PLAIN_DEPTH);
    if (extra) {
      post({ id: ++jobId, kind: "strip", key: extra.key, slots: extra.slots });
      return;
    }
    const featured = await nextFeatured();
    if (featured) {
      post({ id: ++jobId, kind: "strip", key: featured.key, slots: featured.slots });
      return;
    }
    wake(10_000);
  } catch (err) {
    console.error("Drop shelf paused.", err);
    busy = false;
    wake(30_000);
  }
}
