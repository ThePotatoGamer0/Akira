import UPNG from "upng-js";

/** Build a looping APNG from RGBA8 frames. Browsers animate this; Discord does not. */
export function encodeApng(frames: Buffer[], width: number, height: number, delaysMs: number[]): Buffer {
  if (frames.length === 0) {
    throw new Error("encodeApng: at least one frame required");
  }
  if (frames.length !== delaysMs.length) {
    throw new Error("encodeApng: frames and delaysMs length mismatch");
  }
  const expected = width * height * 4;
  const buffers = frames.map((frame) => {
    if (frame.byteLength !== expected) {
      throw new Error(`encodeApng: expected ${expected} bytes per frame, got ${frame.byteLength}`);
    }
    const copy = new Uint8Array(expected);
    copy.set(frame);
    return copy.buffer;
  });
  return Buffer.from(UPNG.encode(buffers, width, height, 0, delaysMs));
}
