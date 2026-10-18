import sharp from "sharp";

const PALETTE_SIZE = 256;
const RESERVED_COLORS = 32;
const LUT_BITS = 5;
const LUT_SIZE = 1 << (LUT_BITS * 3);

type PaletteGif = {
  palette: Uint8Array;
  colorCount: number;
  transparentIndex: number | null;
};

function lutOffset(r: number, g: number, b: number): number {
  return ((r >> (8 - LUT_BITS)) << (LUT_BITS * 2)) | ((g >> (8 - LUT_BITS)) << LUT_BITS) | (b >> (8 - LUT_BITS));
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr * 2 + dg * dg * 4 + db * db * 3;
}

function buildLut(palette: Uint8Array, usable: Uint8Array): Uint8Array {
  const lut = new Uint8Array(LUT_SIZE);
  const colors: number[] = [];
  for (let index = 0; index < PALETTE_SIZE; index++) {
    if (usable[index]) colors.push(index);
  }
  if (colors.length === 0) colors.push(0);
  for (let cell = 0; cell < LUT_SIZE; cell++) {
    const r = ((cell >> (LUT_BITS * 2)) & 31) * 8 + 4;
    const g = ((cell >> LUT_BITS) & 31) * 8 + 4;
    const b = (cell & 31) * 8 + 4;
    let best = colors[0] ?? 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const index of colors) {
      const dist = colorDist(r, g, b, palette[index * 3] ?? 0, palette[index * 3 + 1] ?? 0, palette[index * 3 + 2] ?? 0);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    }
    lut[cell] = best;
  }
  return lut;
}

function usableFrom(colorCount: number, transparentIndex: number | null, extra: number[] = []): Uint8Array {
  const usable = new Uint8Array(PALETTE_SIZE);
  for (let index = 0; index < colorCount; index++) usable[index] = 1;
  for (const index of extra) usable[index] = 1;
  if (transparentIndex !== null) usable[transparentIndex] = 0;
  return usable;
}

/** libimagequant picks the still's colours. Decoding its pixels is unnecessary; the table is enough. */
async function quantizePalette(frame: Buffer, width: number, height: number, dither: number): Promise<PaletteGif> {
  const gif = await sharp(frame, { raw: { width, height, channels: 4 } })
    .gif({
      colours: PALETTE_SIZE - RESERVED_COLORS,
      effort: 1,
      dither,
    })
    .toBuffer();
  if (gif.toString("ascii", 0, 6) !== "GIF89a" && gif.toString("ascii", 0, 6) !== "GIF87a") {
    throw new Error("gif palette: sharp did not return a gif");
  }
  const packed = gif[10] ?? 0;
  if ((packed & 0x80) === 0) throw new Error("gif palette: missing the global colour table");
  const colorCount = 1 << ((packed & 7) + 1);
  const palette = new Uint8Array(PALETTE_SIZE * 3);
  palette.set(gif.subarray(13, 13 + colorCount * 3));
  let pointer = 13 + colorCount * 3;
  let transparentIndex: number | null = null;
  while (pointer < gif.length) {
    const marker = gif[pointer];
    if (marker === 0x3b || marker === 0x2c) break;
    if (marker !== 0x21) throw new Error("gif palette: unexpected block");
    if (gif[pointer + 1] === 0xf9 && gif[pointer + 2] === 4 && ((gif[pointer + 3] ?? 0) & 1) === 1) {
      transparentIndex = gif[pointer + 6] ?? 0;
    }
    pointer += 2;
    while (pointer < gif.length && gif[pointer] !== 0) pointer += 1 + (gif[pointer] ?? 0);
    pointer += 1;
  }
  return { palette, colorCount, transparentIndex };
}

function hasTransparentPixel(frames: Buffer[]): boolean {
  for (const frame of frames) {
    for (let offset = 3; offset < frame.length; offset += 4) {
      if ((frame[offset] ?? 0) < 128) return true;
    }
  }
  return false;
}

function samePixel(a: Buffer, b: Buffer, offset: number): boolean {
  const aClear = (a[offset + 3] ?? 0) < 128;
  const bClear = (b[offset + 3] ?? 0) < 128;
  if (aClear || bClear) return aClear && bClear;
  return a[offset] === b[offset] && a[offset + 1] === b[offset + 1] && a[offset + 2] === b[offset + 2];
}

function indexStill(
  frame: Buffer,
  width: number,
  height: number,
  lut: Uint8Array,
  palette: Uint8Array,
  transparentIndex: number | null,
  dither: number,
): Uint8Array {
  const pixels = width * height;
  const indices = new Uint8Array(pixels);
  const spread = dither >= 0.5;
  const workR = spread ? new Float32Array(pixels) : null;
  const workG = spread ? new Float32Array(pixels) : null;
  const workB = spread ? new Float32Array(pixels) : null;
  if (workR && workG && workB) {
    for (let pixel = 0; pixel < pixels; pixel++) {
      const offset = pixel * 4;
      workR[pixel] = frame[offset] ?? 0;
      workG[pixel] = frame[offset + 1] ?? 0;
      workB[pixel] = frame[offset + 2] ?? 0;
    }
  }
  const spill = (x: number, y: number, er: number, eg: number, eb: number, share: number) => {
    if (!workR || !workG || !workB || x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    workR[pixel] = (workR[pixel] ?? 0) + er * share;
    workG[pixel] = (workG[pixel] ?? 0) + eg * share;
    workB[pixel] = (workB[pixel] ?? 0) + eb * share;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      if ((frame[offset + 3] ?? 0) < 128) {
        indices[pixel] = transparentIndex ?? 0;
        continue;
      }
      const red = spread ? Math.min(255, Math.max(0, Math.round(workR?.[pixel] ?? 0))) : (frame[offset] ?? 0);
      const green = spread ? Math.min(255, Math.max(0, Math.round(workG?.[pixel] ?? 0))) : (frame[offset + 1] ?? 0);
      const blue = spread ? Math.min(255, Math.max(0, Math.round(workB?.[pixel] ?? 0))) : (frame[offset + 2] ?? 0);
      const index = lut[lutOffset(red, green, blue)] ?? 0;
      indices[pixel] = index;
      if (!spread) continue;
      const er = red - (palette[index * 3] ?? 0);
      const eg = green - (palette[index * 3 + 1] ?? 0);
      const eb = blue - (palette[index * 3 + 2] ?? 0);
      spill(x + 1, y, er, eg, eb, 7 / 16);
      spill(x - 1, y + 1, er, eg, eb, 3 / 16);
      spill(x, y + 1, er, eg, eb, 5 / 16);
      spill(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return indices;
}

function channelOf(color: number, channel: number): number {
  return (color >> ((2 - channel) * 8)) & 255;
}

/** Colours the still's palette cannot show, mostly the shine and the flame. */
function medianCut(colors: number[], maxColors: number): number[] {
  if (colors.length === 0 || maxColors <= 0) return [];
  let boxes: number[][] = [colors.slice()];
  while (boxes.length < maxColors) {
    let bestBox = -1;
    let bestSpan = 0;
    let bestChannel = 0;
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index];
      if (!box || box.length < 2) continue;
      for (let channel = 0; channel < 3; channel++) {
        let low = 255;
        let high = 0;
        for (const color of box) {
          const value = channelOf(color, channel);
          if (value < low) low = value;
          if (value > high) high = value;
        }
        const span = high - low;
        if (span > bestSpan) {
          bestSpan = span;
          bestBox = index;
          bestChannel = channel;
        }
      }
    }
    const box = bestBox < 0 ? undefined : boxes[bestBox];
    if (!box) break;
    box.sort((a, b) => channelOf(a, bestChannel) - channelOf(b, bestChannel));
    const mid = box.length >> 1;
    boxes.push(box.splice(mid));
  }
  return boxes.map((box) => {
    let red = 0;
    let green = 0;
    let blue = 0;
    for (const color of box) {
      red += channelOf(color, 0);
      green += channelOf(color, 1);
      blue += channelOf(color, 2);
    }
    const count = box.length || 1;
    return ((Math.round(red / count) & 255) << 16) | ((Math.round(green / count) & 255) << 8) | (Math.round(blue / count) & 255);
  });
}

function sampleMissingColors(
  frames: Buffer[],
  width: number,
  height: number,
  palette: Uint8Array,
  lut: Uint8Array,
): number[] {
  const found = new Set<number>();
  const pixels = width * height;
  const stride = Math.max(1, Math.floor(pixels / 240));
  const first = frames[0];
  if (!first) return [];
  for (let frameIndex = 1; frameIndex < frames.length && found.size < 8000; frameIndex++) {
    const frame = frames[frameIndex];
    if (!frame) continue;
    let seen = 0;
    let taken = 0;
    for (let pixel = 0; pixel < pixels && taken < 240 && found.size < 8000; pixel++) {
      const offset = pixel * 4;
      if ((frame[offset + 3] ?? 0) < 128) continue;
      if (samePixel(frame, first, offset)) continue;
      seen++;
      if (seen % stride !== 0) continue;
      const red = frame[offset] ?? 0;
      const green = frame[offset + 1] ?? 0;
      const blue = frame[offset + 2] ?? 0;
      const nearest = lut[lutOffset(red, green, blue)] ?? 0;
      const dist = colorDist(red, green, blue, palette[nearest * 3] ?? 0, palette[nearest * 3 + 1] ?? 0, palette[nearest * 3 + 2] ?? 0);
      if (dist < 400) continue;
      found.add((red << 16) | (green << 8) | blue);
      taken++;
    }
  }
  return medianCut([...found], RESERVED_COLORS);
}

function installColors(
  colors: number[],
  palette: Uint8Array,
  colorCount: number,
  transparentIndex: number | null,
  indices: Uint8Array,
): number[] {
  if (colors.length === 0) return [];
  const hist = new Uint32Array(PALETTE_SIZE);
  for (const index of indices) hist[index] = (hist[index] ?? 0) + 1;
  const ranked: number[] = [];
  for (let index = colorCount; index < PALETTE_SIZE; index++) {
    if (index !== transparentIndex) ranked.push(index);
  }
  const used = [...Array(colorCount).keys()]
    .filter((index) => index !== transparentIndex)
    .sort((a, b) => (hist[a] ?? 0) - (hist[b] ?? 0));
  ranked.push(...used);
  const slots = ranked.slice(0, colors.length);
  const stolen = new Set(slots.filter((index) => index < colorCount));
  if (stolen.size > 0) {
    const remap = new Uint8Array(PALETTE_SIZE);
    for (let index = 0; index < PALETTE_SIZE; index++) remap[index] = index;
    for (const slot of stolen) {
      let best = slot;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let index = 0; index < colorCount; index++) {
        if (stolen.has(index) || index === transparentIndex) continue;
        const dist = colorDist(
          palette[slot * 3] ?? 0,
          palette[slot * 3 + 1] ?? 0,
          palette[slot * 3 + 2] ?? 0,
          palette[index * 3] ?? 0,
          palette[index * 3 + 1] ?? 0,
          palette[index * 3 + 2] ?? 0,
        );
        if (dist < bestDist) {
          bestDist = dist;
          best = index;
        }
      }
      remap[slot] = best;
    }
    for (let pixel = 0; pixel < indices.length; pixel++) indices[pixel] = remap[indices[pixel] ?? 0] ?? 0;
  }
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index] ?? 0;
    const color = colors[index] ?? 0;
    palette[slot * 3] = (color >> 16) & 255;
    palette[slot * 3 + 1] = (color >> 8) & 255;
    palette[slot * 3 + 2] = color & 255;
  }
  return slots;
}

type EncodedFrame = {
  indices: Uint8Array;
  left: number;
  top: number;
  width: number;
  height: number;
  delayCs: number;
};

function centiseconds(ms: number): number {
  return Math.min(65535, Math.max(1, Math.round(ms / 10)));
}

const littleEndian = new Uint8Array(Uint32Array.of(1).buffer)[0] === 1;

function frameWords(frame: Buffer): Uint32Array | null {
  if (!littleEndian || frame.byteOffset % 4 !== 0 || frame.length % 4 !== 0) return null;
  return new Uint32Array(frame.buffer, frame.byteOffset, frame.length / 4);
}

function sameWord(a: number, b: number): boolean {
  const aClear = (a >>> 24) < 128;
  const bClear = (b >>> 24) < 128;
  if (aClear || bClear) return aClear && bClear;
  return a === b;
}

function changedBounds(previous: Buffer, frame: Buffer, width: number, height: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const previousWords = frameWords(previous);
  const frameWordsView = frameWords(frame);
  if (previousWords && frameWordsView) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (sameWord(previousWords[row + x] ?? 0, frameWordsView[row + x] ?? 0)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      for (let x = 0; x < width; x++) {
        const offset = row + x * 4;
        if (samePixel(previous, frame, offset)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function lzwEncode(indices: Uint8Array): Uint8Array {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const hashSize = 8192;
  const hashMask = hashSize - 1;
  let codes = new Int32Array(hashSize);
  let values = new Int32Array(hashSize);
  codes.fill(-1);
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  const clearTable = () => {
    emit(clearCode);
    codes = new Int32Array(hashSize);
    values = new Int32Array(hashSize);
    codes.fill(-1);
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };
  clearTable();
  if (indices.length === 0) {
    emit(eoiCode);
  } else {
    let prefix = indices[0] ?? 0;
    for (let position = 1; position < indices.length; position++) {
      const suffix = indices[position] ?? 0;
      const key = (prefix << 8) | suffix;
      let slot = ((prefix << 8) ^ suffix) & hashMask;
      while (true) {
        const existing = codes[slot] ?? -1;
        if (existing === -1) {
          emit(prefix);
          if (nextCode === 4096) {
            clearTable();
          } else {
            if (nextCode >= 1 << codeSize && codeSize < 12) codeSize++;
            codes[slot] = key;
            values[slot] = nextCode++;
          }
          prefix = suffix;
          break;
        }
        if (existing === key) {
          prefix = values[slot] ?? suffix;
          break;
        }
        slot = (slot + 1) & hashMask;
      }
    }
    emit(prefix);
    emit(eoiCode);
  }
  if (bits > 0) bytes.push(acc & 255);
  const packed = new Uint8Array(bytes.length + Math.ceil(bytes.length / 255) * 2 + 2);
  let cursor = 0;
  packed[cursor++] = minCodeSize;
  for (let start = 0; start < bytes.length; start += 255) {
    const length = Math.min(255, bytes.length - start);
    packed[cursor++] = length;
    packed.set(bytes.slice(start, start + length), cursor);
    cursor += length;
  }
  packed[cursor++] = 0;
  return packed.subarray(0, cursor);
}

function writeGif(width: number, height: number, palette: Uint8Array, transparentIndex: number | null, frames: EncodedFrame[]): Buffer {
  const chunks: Buffer[] = [];
  const header = Buffer.alloc(13 + PALETTE_SIZE * 3 + 19);
  header.write("GIF89a", 0, "ascii");
  header.writeUInt16LE(width, 6);
  header.writeUInt16LE(height, 8);
  header[10] = 0xf7;
  header[11] = transparentIndex ?? 0;
  header.set(palette.subarray(0, PALETTE_SIZE * 3), 13);
  const netscape = 13 + PALETTE_SIZE * 3;
  header[netscape] = 0x21;
  header[netscape + 1] = 0xff;
  header[netscape + 2] = 0x0b;
  header.write("NETSCAPE2.0", netscape + 3, "ascii");
  header[netscape + 14] = 0x03;
  header[netscape + 15] = 0x01;
  header[netscape + 16] = 0x00;
  header[netscape + 17] = 0x00;
  header[netscape + 18] = 0x00;
  chunks.push(header);
  for (const frame of frames) {
    const control = Buffer.alloc(8);
    control[0] = 0x21;
    control[1] = 0xf9;
    control[2] = 0x04;
    control[3] = transparentIndex === null ? 0x04 : 0x05;
    control.writeUInt16LE(frame.delayCs, 4);
    control[6] = transparentIndex ?? 0;
    control[7] = 0x00;
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(frame.left, 1);
    descriptor.writeUInt16LE(frame.top, 3);
    descriptor.writeUInt16LE(frame.width, 5);
    descriptor.writeUInt16LE(frame.height, 7);
    descriptor[9] = 0x00;
    chunks.push(control, descriptor, Buffer.from(lzwEncode(frame.indices)));
  }
  chunks.push(Buffer.from([0x3b]));
  return Buffer.concat(chunks);
}

/**
 * One palette for the whole animation, then each later frame stores only the
 * rectangle that changed. Quantizing every full frame is what made a mint
 * drop take half a minute on the Pi.
 */
export async function encodeDiffGif(
  frames: Buffer[],
  width: number,
  height: number,
  delaysMs: number[],
  dither = 1,
): Promise<Buffer> {
  const first = frames[0];
  if (!first) throw new Error("gif: at least one frame required");
  const quantized = await quantizePalette(first, width, height, dither);
  let transparentIndex = quantized.transparentIndex;
  if (transparentIndex === null && hasTransparentPixel(frames)) {
    transparentIndex = quantized.colorCount < PALETTE_SIZE ? quantized.colorCount : PALETTE_SIZE - 1;
  }
  const stillLut = buildLut(quantized.palette, usableFrom(quantized.colorCount, transparentIndex));
  const stillIndices = indexStill(first, width, height, stillLut, quantized.palette, transparentIndex, dither);
  const extras = installColors(
    sampleMissingColors(frames, width, height, quantized.palette, stillLut),
    quantized.palette,
    quantized.colorCount,
    transparentIndex,
    stillIndices,
  );
  const lut = extras.length > 0
    ? buildLut(quantized.palette, usableFrom(quantized.colorCount, transparentIndex, extras))
    : stillLut;
  const encoded: EncodedFrame[] = [{
    indices: stillIndices,
    left: 0,
    top: 0,
    width,
    height,
    delayCs: centiseconds(delaysMs[0] ?? 10),
  }];
  const previous = Buffer.from(first);
  for (let frameIndex = 1; frameIndex < frames.length; frameIndex++) {
    const frame = frames[frameIndex];
    if (!frame) continue;
    const delayCs = centiseconds(delaysMs[frameIndex] ?? 10);
    const bounds = changedBounds(previous, frame, width, height);
    if (!bounds) {
      const last = encoded[encoded.length - 1];
      if (last) last.delayCs = Math.min(65535, last.delayCs + delayCs);
      continue;
    }
    const rectWidth = bounds.maxX - bounds.minX + 1;
    const rectHeight = bounds.maxY - bounds.minY + 1;
    const indices = new Uint8Array(rectWidth * rectHeight);
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      const row = y * width;
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const pixel = row + x;
        const offset = pixel * 4;
        let index: number;
        if (samePixel(frame, first, offset)) index = stillIndices[pixel] ?? 0;
        else if ((frame[offset + 3] ?? 0) < 128) index = transparentIndex ?? 0;
        else index = lut[lutOffset(frame[offset] ?? 0, frame[offset + 1] ?? 0, frame[offset + 2] ?? 0)] ?? 0;
        indices[(y - bounds.minY) * rectWidth + (x - bounds.minX)] = index;
      }
      frame.copy(previous, (y * width + bounds.minX) * 4, (y * width + bounds.minX) * 4, (y * width + bounds.maxX + 1) * 4);
    }
    encoded.push({
      indices,
      left: bounds.minX,
      top: bounds.minY,
      width: rectWidth,
      height: rectHeight,
      delayCs,
    });
  }
  return writeGif(width, height, quantized.palette, transparentIndex, encoded);
}

type RepaintRegion = { x: number; y: number; width: number; height: number };

function blitRegion(base: Buffer, stride: number, region: RepaintRegion, target: Buffer): void {
  for (let y = 0; y < region.height; y++) {
    const src = ((region.y + y) * stride + region.x) * 4;
    base.copy(target, y * region.width * 4, src, src + region.width * 4);
  }
}

/**
 * A mint drop only changes the shiny cards. The still strip is quantized once,
 * and every later frame replaces just those cards instead of the whole row.
 */
export async function encodeRepaintedGif(
  base: Buffer,
  width: number,
  height: number,
  frameCount: number,
  delayMs: number,
  regions: RepaintRegion[],
  repaint: (frameIndex: number, scratch: Buffer, regionWidth: number, regionHeight: number) => void,
  dither = 1,
): Promise<Buffer> {
  if (frameCount < 1) throw new Error("gif: at least one frame required");
  if (base.length !== width * height * 4) throw new Error("gif: base has the wrong size");
  const quantized = await quantizePalette(base, width, height, dither);
  let transparentIndex = quantized.transparentIndex;
  if (transparentIndex === null && hasTransparentPixel([base])) {
    transparentIndex = quantized.colorCount < PALETTE_SIZE ? quantized.colorCount : PALETTE_SIZE - 1;
  }
  const stillLut = buildLut(quantized.palette, usableFrom(quantized.colorCount, transparentIndex));
  const stillIndices = indexStill(base, width, height, stillLut, quantized.palette, transparentIndex, dither);
  const scratches = regions.map((region) => Buffer.alloc(region.width * region.height * 4));
  const paintAll = (frameIndex: number) => {
    for (let index = 0; index < regions.length; index++) {
      const region = regions[index];
      const scratch = scratches[index];
      if (!region || !scratch) continue;
      blitRegion(base, width, region, scratch);
      repaint(frameIndex, scratch, region.width, region.height);
    }
  };
  const samples = new Set<number>();
  const sampleFrames = Math.min(frameCount, 6);
  for (let frameIndex = 0; frameIndex < sampleFrames && samples.size < 8000; frameIndex += Math.max(1, Math.floor(sampleFrames / 6))) {
    paintAll(frameIndex);
    for (let regionIndex = 0; regionIndex < regions.length && samples.size < 8000; regionIndex++) {
      const region = regions[regionIndex];
      const scratch = scratches[regionIndex];
      if (!region || !scratch) continue;
      for (let y = 0; y < region.height && samples.size < 8000; y += 3) {
        for (let x = 0; x < region.width && samples.size < 8000; x += 3) {
          const local = (y * region.width + x) * 4;
          const global = ((region.y + y) * width + region.x + x) * 4;
          if ((scratch[local + 3] ?? 0) < 128) continue;
          if (
            (scratch[local + 3] ?? 0) >= 128 &&
            (base[global + 3] ?? 0) >= 128 &&
            scratch[local] === base[global] &&
            scratch[local + 1] === base[global + 1] &&
            scratch[local + 2] === base[global + 2]
          ) {
            continue;
          }
          const red = scratch[local] ?? 0;
          const green = scratch[local + 1] ?? 0;
          const blue = scratch[local + 2] ?? 0;
          const nearest = stillLut[lutOffset(red, green, blue)] ?? 0;
          const dist = colorDist(
            red,
            green,
            blue,
            quantized.palette[nearest * 3] ?? 0,
            quantized.palette[nearest * 3 + 1] ?? 0,
            quantized.palette[nearest * 3 + 2] ?? 0,
          );
          if (dist < 400) continue;
          samples.add((red << 16) | (green << 8) | blue);
        }
      }
    }
  }
  const extras = installColors(
    medianCut([...samples], RESERVED_COLORS),
    quantized.palette,
    quantized.colorCount,
    transparentIndex,
    stillIndices,
  );
  const lut = extras.length > 0
    ? buildLut(quantized.palette, usableFrom(quantized.colorCount, transparentIndex, extras))
    : stillLut;
  const indexRegion = (region: RepaintRegion, scratch: Buffer): Uint8Array => {
    const indices = new Uint8Array(region.width * region.height);
    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const local = y * region.width + x;
        const pixel = (region.y + y) * width + region.x + x;
        const scratchOffset = local * 4;
        const baseOffset = pixel * 4;
        const scratchClear = (scratch[scratchOffset + 3] ?? 0) < 128;
        const baseClear = (base[baseOffset + 3] ?? 0) < 128;
        const unchanged = scratchClear
          ? baseClear
          : !baseClear &&
            scratch[scratchOffset] === base[baseOffset] &&
            scratch[scratchOffset + 1] === base[baseOffset + 1] &&
            scratch[scratchOffset + 2] === base[baseOffset + 2];
        let index: number;
        if (unchanged) index = stillIndices[pixel] ?? 0;
        else if (scratchClear) index = transparentIndex ?? 0;
        else {
          index = lut[lutOffset(scratch[scratchOffset] ?? 0, scratch[scratchOffset + 1] ?? 0, scratch[scratchOffset + 2] ?? 0)] ?? 0;
        }
        indices[local] = index;
      }
    }
    return indices;
  };
  const placeRegions = (indices: Uint8Array, frameIndex: number) => {
    paintAll(frameIndex);
    for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
      const region = regions[regionIndex];
      const scratch = scratches[regionIndex];
      if (!region || !scratch) continue;
      const regionIndices = indexRegion(region, scratch);
      for (let y = 0; y < region.height; y++) {
        indices.set(regionIndices.subarray(y * region.width, (y + 1) * region.width), (region.y + y) * width + region.x);
      }
    }
  };
  const full = new Uint8Array(stillIndices);
  placeRegions(full, 0);
  const encoded: EncodedFrame[] = [{
    indices: full,
    left: 0,
    top: 0,
    width,
    height,
    delayCs: centiseconds(delayMs),
  }];
  if (regions.length === 0) {
    return writeGif(width, height, quantized.palette, transparentIndex, encoded);
  }
  const prior = scratches.map((scratch) => Buffer.from(scratch));
  for (let frameIndex = 1; frameIndex < frameCount; frameIndex++) {
    for (let regionIndex = 0; regionIndex < prior.length; regionIndex++) {
      const before = prior[regionIndex];
      const scratch = scratches[regionIndex];
      if (before && scratch) before.set(scratch);
    }
    paintAll(frameIndex);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
      const region = regions[regionIndex];
      const scratch = scratches[regionIndex];
      const before = prior[regionIndex];
      if (!region || !scratch || !before) continue;
      for (let y = 0; y < region.height; y++) {
        for (let x = 0; x < region.width; x++) {
          const local = (y * region.width + x) * 4;
          if (samePixel(scratch, before, local)) continue;
          const stripX = region.x + x;
          const stripY = region.y + y;
          if (stripX < minX) minX = stripX;
          if (stripY < minY) minY = stripY;
          if (stripX > maxX) maxX = stripX;
          if (stripY > maxY) maxY = stripY;
        }
      }
    }
    const delayCs = centiseconds(delayMs);
    if (maxX < 0) {
      const last = encoded[encoded.length - 1];
      if (last) last.delayCs = Math.min(65535, last.delayCs + delayCs);
      continue;
    }
    const rectWidth = maxX - minX + 1;
    const rectHeight = maxY - minY + 1;
    const indices = new Uint8Array(rectWidth * rectHeight);
    for (let y = 0; y < rectHeight; y++) {
      const src = (minY + y) * width + minX;
      indices.set(stillIndices.subarray(src, src + rectWidth), y * rectWidth);
    }
    for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
      const region = regions[regionIndex];
      const scratch = scratches[regionIndex];
      if (!region || !scratch) continue;
      const regionIndices = indexRegion(region, scratch);
      const startX = Math.max(region.x, minX);
      const endX = Math.min(region.x + region.width, maxX + 1);
      const startY = Math.max(region.y, minY);
      const endY = Math.min(region.y + region.height, maxY + 1);
      for (let y = startY; y < endY; y++) {
        const row = regionIndices.subarray((y - region.y) * region.width + (startX - region.x), (y - region.y) * region.width + (endX - region.x));
        indices.set(row, (y - minY) * rectWidth + (startX - minX));
      }
    }
    encoded.push({
      indices,
      left: minX,
      top: minY,
      width: rectWidth,
      height: rectHeight,
      delayCs,
    });
  }
  return writeGif(width, height, quantized.palette, transparentIndex, encoded);
}
