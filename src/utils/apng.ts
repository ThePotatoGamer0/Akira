import UPNG from "upng-js";

/**
 * Build an APNG from RGBA8 frame buffers (width × height × 4 bytes per frame).
 * `delaysMs` - per-frame delay in milliseconds (APNG delay_num / 1000).
 */
export function encodeApng(frames: Buffer[], width: number, height: number, delaysMs: number[]): Buffer {
  if (frames.length === 0) {
    throw new Error("encodeApng: at least one frame required");
  }
  if (frames.length !== delaysMs.length) {
    throw new Error("encodeApng: frames and delaysMs length mismatch");
  }
  const expected = width * height * 4;
  const imgs: ArrayBuffer[] = [];
  for (const f of frames) {
    if (f.byteLength !== expected) {
      throw new Error(`encodeApng: expected ${expected} bytes per frame, got ${f.byteLength}`);
    }
    imgs.push(new Uint8Array(f).buffer);
  }
  const out = UPNG.encode(imgs, width, height, 0, delaysMs);
  return Buffer.from(new Uint8Array(out as ArrayBuffer));
}
