import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import { redrawCachedGroup, type CacheWorkerJob, type CacheWorkerResult } from "./card-redraw.js";

sharp.concurrency(1);

parentPort?.on("message", (job: CacheWorkerJob) => {
  void run(job);
});

async function run(job: CacheWorkerJob): Promise<void> {
  try {
    const result = await redrawCachedGroup(job.group, job.variant);
    const message: CacheWorkerResult = { id: job.id, ok: true, redrawn: result.redrawn, skipped: result.skipped };
    parentPort?.postMessage(message);
  } catch (err) {
    const message: CacheWorkerResult = {
      id: job.id,
      ok: false,
      redrawn: 0,
      skipped: job.group.files.length,
      error: err instanceof Error ? err.message : "card refresh failed",
    };
    parentPort?.postMessage(message);
  }
}
