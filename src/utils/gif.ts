import sharp from "sharp";
import { encodeDiffGifImage } from "./gif-fast.js";

export type GifEncodeOptions = {
  dither?: number;
  reuse?: boolean;
  interFrameMaxError?: number;
  effort?: number;
  /** Quantize every frame in libvips. Burns change the whole card, and that path is faster there. */
  native?: boolean;
  /** Shine frames differ only in a band, so libvips can store just the changed rectangle. */
  diff?: boolean;
};

/**
 * Turn the frames into one tall picture, much the way libvips reads a GIF. Both
 * encoders want that same memory order, so the frames are gathered once.
 */
export function pagesToImage(frames: Buffer[]): Buffer {
  return Buffer.concat(frames);
}

/** Build a looping GIF from already gathered frames. */
export async function encodeGifImage(
  image: Buffer,
  width: number,
  height: number,
  frameCount: number,
  delaysMs: number[],
  options?: GifEncodeOptions,
): Promise<Buffer> {
  if (frameCount === 0) {
    throw new Error("encodeGif: at least one frame required");
  }
  if (frameCount !== delaysMs.length) {
    throw new Error("encodeGif: frames and delaysMs length mismatch");
  }
  const expected = width * height * 4 * frameCount;
  if (image.byteLength !== expected) {
    throw new Error(`encodeGif: expected ${expected} bytes of frames, got ${image.byteLength}`);
  }
  if (frameCount > 1 && options?.diff === true) {
    return encodeDiffGifImage(image, width, height, frameCount, delaysMs, options?.dither ?? 1);
  }
  return sharp(image, {
    raw: { width, height: height * frameCount, channels: 4, pageHeight: height },
  })
    .gif({
      delay: delaysMs,
      loop: 0,
      effort: options?.effort ?? 4,
      dither: options?.dither,
      reuse: options?.reuse ?? true,
      interFrameMaxError: options?.interFrameMaxError ?? 0,
    })
    .toBuffer();
}

/** Build a looping GIF from RGBA8 frames. Discord animates GIF attachments and leaves APNG still. */
export async function encodeGif(
  frames: Buffer[],
  width: number,
  height: number,
  delaysMs: number[],
  options?: GifEncodeOptions,
): Promise<Buffer> {
  return encodeGifImage(pagesToImage(frames), width, height, frames.length, delaysMs, options);
}
