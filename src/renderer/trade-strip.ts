import sharp from "sharp";
import { encodeGif } from "../utils/gif.js";

/** Space around the pair, matching the drop strip. */
const GAP = 16;
/** Column between the two cards. The swap arrows sit in here. */
const ARROW_WIDTH = 96;
const ARROW = "#E040FB";

export type TradePair = {
  data: Buffer;
  animated: boolean;
};

type Decoded = {
  width: number;
  height: number;
  frames: Buffer[];
  delays: number[];
};

function arrowSvg(width: number, height: number): string {
  const mid = height / 2;
  const top = mid - 22;
  const bottom = mid + 22;
  const left = 18;
  const right = width - 18;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="${ARROW}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
      <path d="M${right} ${top} H${left + 16}"/>
      <path d="M${left + 28} ${top - 14} L${left} ${top} L${left + 28} ${top + 14}"/>
      <path d="M${left} ${bottom} H${right - 16}"/>
      <path d="M${right - 28} ${bottom - 14} L${right} ${bottom} L${right - 28} ${bottom + 14}"/>
    </g>
  </svg>`;
}

async function arrowPng(height: number): Promise<Buffer> {
  return sharp(Buffer.from(arrowSvg(ARROW_WIDTH, height)))
    .resize(ARROW_WIDTH, height)
    .png()
    .toBuffer();
}

async function decodeImage(image: Buffer): Promise<Decoded> {
  const meta = await sharp(image, { animated: true }).metadata();
  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  const pages = meta.pages ?? 1;
  if (!width || !height) throw new Error("trade image: card has no size");
  const { data, info } = await sharp(image, { animated: true, pages: -1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error("trade image: expected 4 channels");
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
  return { width, height, frames, delays };
}

function blit(
  out: Buffer,
  src: Buffer,
  srcWidth: number,
  srcHeight: number,
  destX: number,
  destY: number,
  destWidth: number,
): void {
  for (let y = 0; y < srcHeight; y++) {
    const from = y * srcWidth * 4;
    src.copy(out, ((destY + y) * destWidth + destX) * 4, from, from + srcWidth * 4);
  }
}

function stitchFrame(left: Decoded, right: Decoded, arrow: Buffer, frameIndex: number): Buffer {
  const cardHeight = Math.max(left.height, right.height);
  const width = GAP + left.width + ARROW_WIDTH + right.width + GAP;
  const height = cardHeight + GAP * 2;
  const out = Buffer.alloc(width * height * 4);
  const leftFrame = left.frames[frameIndex % left.frames.length];
  const rightFrame = right.frames[frameIndex % right.frames.length];
  if (!leftFrame || !rightFrame) throw new Error("trade image: card has no frames");
  blit(out, leftFrame, left.width, left.height, GAP, GAP, width);
  blit(out, arrow, ARROW_WIDTH, cardHeight, GAP + left.width, GAP, width);
  blit(out, rightFrame, right.width, right.height, GAP + left.width + ARROW_WIDTH, GAP, width);
  return out;
}

async function stitchStill(left: Buffer, right: Buffer): Promise<Buffer> {
  const leftMeta = await sharp(left).metadata();
  const rightMeta = await sharp(right).metadata();
  const leftWidth = leftMeta.width ?? 0;
  const rightWidth = rightMeta.width ?? 0;
  const cardHeight = Math.max(leftMeta.height ?? 0, rightMeta.height ?? 0);
  const width = GAP + leftWidth + ARROW_WIDTH + rightWidth + GAP;
  const height = cardHeight + GAP * 2;
  const arrow = await arrowPng(cardHeight);
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: left, left: GAP, top: GAP },
      { input: arrow, left: GAP + leftWidth, top: GAP },
      { input: right, left: GAP + leftWidth + ARROW_WIDTH, top: GAP },
    ])
    .png()
    .toBuffer();
}

/** Two cards with a swap arrow between them. A shiny card makes the whole image a GIF. */
export async function renderTradePair(left: Buffer, right: Buffer, animated: boolean): Promise<TradePair> {
  if (!animated) return { data: await stitchStill(left, right), animated: false };
  const [decodedLeft, decodedRight] = await Promise.all([decodeImage(left), decodeImage(right)]);
  const cardHeight = Math.max(decodedLeft.height, decodedRight.height);
  const arrowPngBuffer = await arrowPng(cardHeight);
  const { data: arrow, info } = await sharp(arrowPngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== ARROW_WIDTH || info.height !== cardHeight) {
    throw new Error("trade image: arrow came out the wrong size");
  }
  const lead = decodedLeft.frames.length >= decodedRight.frames.length ? decodedLeft : decodedRight;
  const frameCount = Math.max(lead.frames.length, 1);
  const width = GAP + decodedLeft.width + ARROW_WIDTH + decodedRight.width + GAP;
  const height = cardHeight + GAP * 2;
  const frames: Buffer[] = [];
  const delays: number[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(stitchFrame(decodedLeft, decodedRight, arrow, i));
    const delay = lead.delays[i] ?? 0;
    delays.push(delay > 0 ? delay : 60);
  }
  return { data: await encodeGif(frames, width, height, delays), animated: true };
}
