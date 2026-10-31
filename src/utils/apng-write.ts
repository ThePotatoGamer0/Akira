import { crc32, deflateSync } from "node:zlib";

/**
 * Filter type 0 means the page is stored as it is. Every other PNG filter makes
 * these card pages bigger here, because they repeat few colours in stripes.
 */
const FILTER_NONE = 0;
const LEVEL = 7;

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * Every page after the first is sent as the rectangle where it differs from the
 * page before, laid over it. A shine band moves down the card; the last page is
 * sent whole, because the animation loops and the card has to be back.
 */
export function writeApng(image: Buffer, width: number, height: number, frameCount: number, delaysMs: number[]): Buffer {
  const page = width * height * 4;
  const chunks: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  chunks.push(chunk("IHDR", header));
  const animated = frameCount > 1;
  if (animated) {
    const control = Buffer.alloc(8);
    control.writeUInt32BE(frameCount, 0);
    chunks.push(chunk("acTL", control));
  }
  let sequence = 0;
  for (let index = 0; index < frameCount; index++) {
    const whole: Box = { x: 0, y: 0, width, height };
    // The last page is often sent whole already, and content below it is dropped, so nothing is kept for a "before".
    const area = index > 0 ? window(image, page, width, height, index) ?? whole : whole;
    if (animated) {
      const frame = Buffer.alloc(26);
      frame.writeUInt32BE(sequence++, 0);
      frame.writeUInt32BE(area.width, 4);
      frame.writeUInt32BE(area.height, 8);
      frame.writeUInt32BE(area.x, 12);
      frame.writeUInt32BE(area.y, 16);
      frame.writeUInt16BE(delaysMs[index] ?? 60, 20);
      frame.writeUInt16BE(1000, 22);
      // The first page replaces the canvas; later ones blend over the page before them.
      frame[24] = 0;
      frame[25] = index === 0 ? 0 : 1;
      chunks.push(chunk("fcTL", frame));
    }
    const packed = pack(image, index * page, width, area);
    if (index === 0) {
      chunks.push(chunk("IDAT", packed));
      continue;
    }
    const body = Buffer.alloc(packed.length + 4);
    body.writeUInt32BE(sequence++, 0);
    packed.copy(body, 4);
    chunks.push(chunk("fdAT", body));
  }
  chunks.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

/** The rows a page changed on across its full width, which is where a shine band is drawn. */
function window(image: Buffer, page: number, width: number, height: number, index: number): Box | null {
  const now = index * page;
  const before = now - page;
  const stride = width * 4;
  let firstRow = -1;
  let lastRow = -1;
  for (let y = 0; y < height; y++) {
    const from = now + y * stride;
    const was = before + y * stride;
    if (!image.subarray(was, was + stride).equals(image.subarray(from, from + stride))) {
      if (firstRow < 0) firstRow = y;
      lastRow = y;
    }
  }
  if (lastRow < 0) return null;
  return { x: 0, y: firstRow, width, height: lastRow - firstRow + 1 };
}

/** One rectangle of a page, unfiltered and deflated. */
function pack(image: Buffer, start: number, width: number, area: Box): Buffer {
  const rowBytes = area.width * 4;
  const packed = Buffer.alloc((rowBytes + 1) * area.height);
  for (let y = 0; y < area.height; y++) {
    const out = y * (rowBytes + 1);
    const from = start + ((area.y + y) * width + area.x) * 4;
    packed[out] = FILTER_NONE;
    image.copy(packed, out + 1, from, from + rowBytes);
  }
  return deflateSync(packed, { level: LEVEL });
}
