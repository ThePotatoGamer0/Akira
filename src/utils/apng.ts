import sharp from "sharp";
import { writeApng } from "./apng-write.js";


/** Build a looping APNG from RGBA8 frames. Browsers animate this; Discord does not. */
export function encodeApng(frames: Buffer[], width: number, height: number, delaysMs: number[]): Buffer {
  if (frames.length === 0) {
    throw new Error("encodeApng: at least one frame required");
  }
  if (frames.length !== delaysMs.length) {
    throw new Error("encodeApng: frames and delaysMs length mismatch");
  }
  return encodeApngImage(Buffer.concat(frames), width, height, frames.length, delaysMs);
}

/**
 * The same as `encodeApng`, for frames gathered into one tall picture. The
 * frames are only read, never copied, so a burn's 56 pages do not become 56 more.
 */
export function encodeApngImage(image: Buffer, width: number, height: number, frameCount: number, delaysMs: number[]): Buffer {
  if (frameCount === 0) {
    throw new Error("encodeApng: at least one frame required");
  }
  if (frameCount !== delaysMs.length) {
    throw new Error("encodeApng: frames and delaysMs length mismatch");
  }
  const total = width * height * 4 * frameCount;
  if (image.byteLength !== total) {
    throw new Error(`encodeApng: expected ${total} bytes of frames, got ${image.byteLength}`);
  }
  return writeApng(image, width, height, frameCount, delaysMs);
}

/** Frames of an animated GIF or APNG, decoded once into RGBA. */
async function animatedFrames(
  animated: Buffer,
): Promise<{ frames: Buffer[]; width: number; height: number; delays: number[] }> {
  const meta = await sharp(animated, { animated: true }).metadata();
  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  const pages = meta.pages ?? 1;
  if (!width || !height) throw new Error("apng: the animation has no size");
  const { data, info } = await sharp(animated, { animated: true, pages: -1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error("apng: expected 4 channels");
  const frameBytes = width * height * 4;
  const frames: Buffer[] = [];
  for (let page = 0; page < pages; page++) {
    const start = page * frameBytes;
    frames.push(Buffer.from(data.subarray(start, start + frameBytes)));
  }
  const delays = frames.map((_, index) => {
    const delay = meta.delay?.[index] ?? 0;
    return delay > 0 ? delay : 60;
  });
  return { frames, width, height, delays };
}

/**
 * Repack an already-encoded GIF or APNG as an APNG. The frames are already what
 * the renderer produced, so this skips quantizing the card a second time.
 */
export async function gifToApng(gif: Buffer): Promise<Buffer> {
  const { frames, width, height, delays } = await animatedFrames(gif);
  return encodeApng(frames, width, height, delays);
}
