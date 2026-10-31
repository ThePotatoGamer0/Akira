import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import { writeApng } from "../utils/apng-write.js";
import { layShineStrip, shinePatches, SHINE_TILE } from "../renderer/card-animations.js";
import { limitQuantizerThreads } from "../renderer/quantizer-threads.js";
import type { ShineStripJob } from "./shine-pool.js";

sharp.concurrency(1);
await limitQuantizerThreads();

/**
 * One strip of the shine: its pages, each the one before with the band moved
 * on, and the APNG of those pages when the card wants one.
 */
parentPort?.on("message", (message: { shineJob?: ShineStripJob }) => {
  const job = message.shineJob;
  if (!job) return;
  try {
    const patches = shinePatches(job.rgba, job.width, job.height, job.strip);
    const image = Buffer.alloc(job.width * job.height * 4 * Math.max(1, patches.length));
    layShineStrip(image, job.width, job.height, 0, patches);
    const frames = Math.min(SHINE_TILE, patches.length);
    const delays: number[] = [];
    for (let index = 0; index < frames; index++) delays.push(job.delayMs);
    const apng = job.apng ? writeApng(image, job.width, job.height, frames, delays) : null;
    parentPort?.postMessage({ ok: true, image, apng });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.message : "shine strip failed" });
  }
});
