import { MessagePort, parentPort, receiveMessageOnPort } from "node:worker_threads";
import sharp from "sharp";
import type { FarmRedrawJob } from "../game/card-cache.js";
import { renderCardFiles } from "../game/compose.js";
import { limitQuantizerThreads } from "../renderer/quantizer-threads.js";
import type { FrameAsset } from "../utils/frames.js";
import type { ShineCut, ShineStripJob, ShineThreads } from "./shine-pool.js";
import type { FarmWorkerJob, FarmWorkerResult } from "./worker.js";

sharp.concurrency(1);
await limitQuantizerThreads();

export type { FarmWorkerJob, FarmWorkerResult };

/** Where shine strips go when the farm started some threads for them. */
let shines: ShineThreads | null = null;

/**
 * The thread that started this one can pass a `MessagePort`, which carries the
 * shine pool's requests to where the strips are drawn.
 */
parentPort?.on("message", (message: FarmWorkerJob | { shinePort: MessagePort }) => {
  const port = (message as { shinePort?: MessagePort }).shinePort;
  if (port) {
    shines = onPort(port);
    // Work sent straight after the port waits here, or this callback would miss it.
    if (parentPort) for (let next = receiveMessageOnPort(parentPort); next; next = receiveMessageOnPort(parentPort)) {
      void run(next.message as FarmWorkerJob);
    }
    return;
  }
  void run(message as FarmWorkerJob);
});

function onPort(port: MessagePort): ShineThreads {
  let next = 1;
  const waiting = new Map<number, { resolve: (cut: ShineCut) => void; reject: (err: Error) => void }>();
  port.on("message", (reply: { id: number; ok: boolean; image?: Buffer; apng?: Buffer | null; error?: string }) => {
    const entry = waiting.get(reply.id);
    if (!entry) return;
    waiting.delete(reply.id);
    if (reply.ok && reply.image) entry.resolve({ image: Buffer.from(reply.image), apng: reply.apng ? Buffer.from(reply.apng) : null });
    else entry.reject(new Error(reply.error ?? "shine strip failed"));
  });
  const thread: ShineThreads = {
    cut: (job: ShineStripJob) => new Promise<ShineCut>((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject });
      port.postMessage({ id, ...job });
    }),
    close: async () => undefined,
  };
  return thread;
}

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
      ...(shines ? { shineThreads: shines } : {}),
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
