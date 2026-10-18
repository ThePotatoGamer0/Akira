import fs from "node:fs";
import { parentPort } from "node:worker_threads";
import type { Quality } from "../game/balance.js";
import { ensureCardImage, visualKind, type CardImageRequest } from "../game/compose.js";
import { renderDropStripFromStills } from "../renderer/drop-strip.js";

type StripSlot = {
  variantId: string;
  seriesSlug: string;
  characterSlug: string;
  imageFile: string;
  characterName: string;
  seriesName: string;
  frameId: number;
  quality: Quality;
};

type ShelfJob =
  | { id: number; kind: "strip"; slots: StripSlot[] }
  | { id: number; kind: "burn"; request: CardImageRequest };

parentPort?.on("message", (job: ShelfJob) => {
  void run(job);
});

async function run(job: ShelfJob): Promise<void> {
  try {
    if (job.kind === "burn") {
      await ensureCardImage(job.request);
      parentPort?.postMessage({ id: job.id, ok: true, kind: "burn" });
      return;
    }
    const cards = await Promise.all(job.slots.map(async (slot) => {
      const imagePath = await ensureCardImage({
        variantId: slot.variantId,
        seriesSlug: slot.seriesSlug,
        characterSlug: slot.characterSlug,
        imageFile: slot.imageFile,
        characterName: slot.characterName,
        seriesName: slot.seriesName,
        frameId: slot.frameId,
        printNumber: null,
        dye: null,
        kind: "normal",
      });
      return { image: fs.readFileSync(imagePath), shiny: visualKind(slot.quality, null) === "shiny" };
    }));
    const strip = await renderDropStripFromStills(cards);
    parentPort?.postMessage({ id: job.id, ok: true, kind: "strip", data: strip.data, animated: strip.animated });
  } catch (err) {
    parentPort?.postMessage({
      id: job.id,
      ok: false,
      error: err instanceof Error ? err.message : "drop shelf failed",
    });
  }
}
