import sharp from "sharp";

/** Where libvips keeps libimagequant. Without it, quantizing runs on every core. */
const LIBIMAGEQUANT = "/usr/lib/libvips/libvips42.so";

/**
 * libimagequant threads through OpenMP, which is one pool for the whole process.
 * Workers that each ask for the palette at the same time end up waiting on that
 * one pool, so each worker makes it single-threaded and the workers are the
 * parallelism instead.
 */
export async function limitQuantizerThreads(): Promise<void> {
  const ops = Object.getOwnPropertySymbols(sharp).find((symbol) => String(symbol) === "Symbol(sharp.operations)");
  try {
    if (ops) {
      const state = (sharp as unknown as Record<symbol, { threadLimit?: number; blockThread?: boolean }>)[ops];
      if (state) {
        state.threadLimit = 1;
        // sharp counts a pool of two as "no limit"; one is what OpenMP reads.
        state.blockThread = true;
      }
    }
    await sharp(LIBIMAGEQUANT).metadata();
  } catch {
    // Only libvips knows the pool. Without it the quantizer keeps the default.
  }
}
