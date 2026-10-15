import sharp from "sharp";
import { encodeGif } from "../utils/gif.js";

export type DropStripCard = {
  image: Buffer;
  animated: boolean;
};

export type DropStrip = {
  data: Buffer;
  animated: boolean;
};

/** Space around every card in the drop image, including the outer edge. */
export const DROP_STRIP_GAP = 16;

function stripSize(widths: number[], cardHeight: number): { width: number; height: number } {
  const inner = widths.reduce((sum, width) => sum + width, 0);
  return {
    width: inner + DROP_STRIP_GAP * (widths.length + 1),
    height: cardHeight + DROP_STRIP_GAP * 2,
  };
}

type DecodedCard = {
  width: number;
  height: number;
  frames: Buffer[];
  delays: number[];
};

async function decodeCard(image: Buffer): Promise<DecodedCard> {
  const meta = await sharp(image, { animated: true }).metadata();
  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  const pages = meta.pages ?? 1;
  if (!width || !height) throw new Error("drop strip: card has no size");
  const { data, info } = await sharp(image, { animated: true, pages: -1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error("drop strip: expected 4 channels");
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

function stitchRgba(cards: DecodedCard[], frameIndex: number): { data: Buffer; width: number; height: number } {
  const cardHeight = Math.max(...cards.map((card) => card.height));
  const { width, height } = stripSize(cards.map((card) => card.width), cardHeight);
  const out = Buffer.alloc(width * height * 4);
  let x = DROP_STRIP_GAP;
  for (const card of cards) {
    const frame = card.frames[frameIndex % card.frames.length];
    if (!frame) throw new Error("drop strip: card has no frames");
    for (let y = 0; y < card.height; y++) {
      const src = y * card.width * 4;
      frame.copy(out, ((y + DROP_STRIP_GAP) * width + x) * 4, src, src + card.width * 4);
    }
    x += card.width + DROP_STRIP_GAP;
  }
  return { data: out, width, height };
}

async function stitchStill(images: Buffer[]): Promise<Buffer> {
  const metas = await Promise.all(images.map((image) => sharp(image).metadata()));
  const cardHeight = Math.max(...metas.map((meta) => meta.height ?? 0));
  const { width, height } = stripSize(metas.map((meta) => meta.width ?? 0), cardHeight);
  let left = DROP_STRIP_GAP;
  const layers = images.map((image, index) => {
    const layer = { input: image, left, top: DROP_STRIP_GAP };
    left += (metas[index]?.width ?? 0) + DROP_STRIP_GAP;
    return layer;
  });
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

/** Place drop cards in a row. A still strip is PNG. Any shiny card makes the whole strip a GIF. */
export async function renderDropStrip(cards: DropStripCard[]): Promise<DropStrip> {
  if (cards.length === 0) throw new Error("drop strip: no cards");
  const animated = cards.some((card) => card.animated);
  if (!animated) {
    return { data: await stitchStill(cards.map((card) => card.image)), animated: false };
  }

  const decoded = await Promise.all(cards.map((card) => decodeCard(card.image)));
  const lead = decoded.reduce((best, card) => (card.frames.length > best.frames.length ? card : best));
  const frameCount = Math.max(lead.frames.length, 1);
  const first = stitchRgba(decoded, 0);
  const frames = [first.data];
  const delays = [lead.delays[0] && lead.delays[0] > 0 ? lead.delays[0] : 60];
  for (let i = 1; i < frameCount; i++) {
    frames.push(stitchRgba(decoded, i).data);
    const delay = lead.delays[i] ?? 0;
    delays.push(delay > 0 ? delay : 60);
  }
  return { data: await encodeGif(frames, first.width, first.height, delays), animated: true };
}
