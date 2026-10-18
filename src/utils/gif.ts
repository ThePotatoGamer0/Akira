import sharp from "sharp";
import { encodeDiffGif } from "./gif-fast.js";

export type GifEncodeOptions = {
  dither?: number;
  reuse?: boolean;
  interFrameMaxError?: number;
  effort?: number;
  /** Quantize every frame in libvips. Burns change the whole card, and that path is faster there. */
  native?: boolean;
};

/** Build a looping GIF from RGBA8 frames. Discord animates GIF attachments and leaves APNG still. */
export async function encodeGif(
  frames: Buffer[],
  width: number,
  height: number,
  delaysMs: number[],
  options?: GifEncodeOptions,
): Promise<Buffer> {
  if (frames.length === 0) {
    throw new Error("encodeGif: at least one frame required");
  }
  if (frames.length !== delaysMs.length) {
    throw new Error("encodeGif: frames and delaysMs length mismatch");
  }
  const expected = width * height * 4;
  for (const frame of frames) {
    if (frame.byteLength !== expected) {
      throw new Error(`encodeGif: expected ${expected} bytes per frame, got ${frame.byteLength}`);
    }
  }
  if (frames.length > 1 && options?.native !== true) {
    return encodeDiffGif(frames, width, height, delaysMs, options?.dither ?? 1);
  }
  return sharp(Buffer.concat(frames), {
    raw: { width, height: height * frames.length, channels: 4, pageHeight: height },
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
