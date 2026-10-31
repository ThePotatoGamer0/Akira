import type { FarmRedrawJob } from "../game/card-cache.js";
import type { FrameAsset } from "../utils/frames.js";

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
