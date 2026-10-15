import sharp from "sharp";

/** Build a looping GIF from RGBA8 frames. Discord animates GIF attachments and leaves APNG still. */
export async function encodeGif(frames: Buffer[], width: number, height: number, delaysMs: number[]): Promise<Buffer> {
  if (frames.length === 0) {
    throw new Error("encodeGif: at least one frame required");
  }
  if (frames.length !== delaysMs.length) {
    throw new Error("encodeGif: frames and delaysMs length mismatch");
  }
  const expected = width * height * 4;
  const pngs: Buffer[] = [];
  for (const frame of frames) {
    if (frame.byteLength !== expected) {
      throw new Error(`encodeGif: expected ${expected} bytes per frame, got ${frame.byteLength}`);
    }
    pngs.push(await sharp(frame, { raw: { width, height, channels: 4 } }).png().toBuffer());
  }
  return sharp(pngs, { join: { animated: true } })
    .gif({ delay: delaysMs, loop: 0, effort: 4 })
    .toBuffer();
}
