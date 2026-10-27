import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import type { FarmRedrawJob } from "../game/card-cache.js";
import { renderCardFiles } from "../game/compose.js";
import type { FrameAsset } from "../utils/frames.js";

sharp.concurrency(1);

export type FarmWorkerJob = FarmRedrawJob & {
  artPath: string;
  frame: FrameAsset;
};

export type FarmWorkerResult = {
  id: number;
  ok: boolean;
  files: Array<{ fileName: string; data: Buffer }>;
  error?: string;
};

parentPort?.on("message", (job: FarmWorkerJob) => {
  void run(job);
});

async function run(job: FarmWorkerJob): Promise<void> {
  try {
    const files = await renderCardFiles({
      variantId: job.group.variantId,
      seriesSlug: job.variant.seriesSlug,
      characterSlug: job.variant.characterSlug,
      imageFile: job.variant.image,
      characterName: job.variant.characterName,
      seriesName: job.variant.seriesName,
      frameId: job.group.frameId,
      printNumber: job.group.printNumber,
      dye: job.group.dye,
    }, job.group.files, {
      artPath: job.artPath,
      frame: job.frame,
      reuseStill: false,
    });
    const message: FarmWorkerResult = { id: job.id, ok: true, files };
    parentPort?.postMessage(message);
  } catch (err) {
    const message: FarmWorkerResult = {
      id: job.id,
      ok: false,
      files: [],
      error: err instanceof Error ? err.message : "farm worker failed",
    };
    parentPort?.postMessage(message);
  }
}
