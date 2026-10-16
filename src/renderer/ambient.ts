import sharp from "sharp";

/**
 * A still of the Kawarp look: the card art shrunk until it is only color,
 * then pushed around by a fixed noise field. Discord cards cannot run the
 * live WebGL version, so the warp is frozen.
 */

const LIGHT_INK = { name: "#F4F5F7", series: "#A3A8B0", print: "#8E939C" };
const DARK_INK = { name: "#1C1914", series: "#4A4332", print: "#5A5140" };

export type AmbientInk = { name: string; series: string; print: string };

function hash(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const n00 = hash(x0, y0);
  const n10 = hash(x0 + 1, y0);
  const n01 = hash(x0, y0 + 1);
  const n11 = hash(x0 + 1, y0 + 1);
  const nx0 = n00 + (n10 - n00) * tx;
  const nx1 = n01 + (n11 - n01) * tx;
  return nx0 + (nx1 - nx0) * ty;
}

function sample(field: Buffer, width: number, height: number, x: number, y: number): [number, number, number] {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, x - x0));
  const ty = Math.min(1, Math.max(0, y - y0));
  const at = (px: number, py: number) => {
    const index = (py * width + px) * 3;
    return [field[index] ?? 0, field[index + 1] ?? 0, field[index + 2] ?? 0] as [number, number, number];
  };
  const a = at(x0, y0);
  const b = at(x1, y0);
  const c = at(x0, y1);
  const d = at(x1, y1);
  return [0, 1, 2].map((channel) => {
    const top = a[channel] + (b[channel] - a[channel]) * tx;
    const bottom = c[channel] + (d[channel] - c[channel]) * tx;
    return Math.round(top + (bottom - top) * ty);
  }) as [number, number, number];
}

function warp(field: Buffer, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const dx = (valueNoise(u * 2.2, v * 2.2) * 2 - 1) * 36 + (valueNoise(u * 5.5 + 4, v * 5.5) * 2 - 1) * 10;
      const dy = (valueNoise(u * 2.2 + 9, v * 2.2 + 3) * 2 - 1) * 36 + (valueNoise(u * 5.5 + 1, v * 5.5 + 7) * 2 - 1) * 10;
      const [r, g, b] = sample(field, width, height, x + dx, y + dy);
      const index = (y * width + x) * 3;
      out[index] = r;
      out[index + 1] = g;
      out[index + 2] = b;
    }
  }
  return out;
}

/** RGB color field, 3 channels, covering `width` by `height`. */
export async function ambientField(artPath: string, width: number, height: number): Promise<Buffer> {
  const soft = await sharp(artPath)
    .resize(width, height, { fit: "cover", position: "centre" })
    .resize(8, 12, { fit: "fill" })
    .resize(width, height, { kernel: "lanczos3" })
    .blur(16)
    .modulate({ brightness: 0.92 })
    .removeAlpha()
    .raw()
    .toBuffer();
  return warp(soft, width, height);
}

/** Light ink on a dark wash, dark ink on a bright one. Samples the caption band. */
export function inkForField(field: Buffer, width: number, height: number): AmbientInk {
  const y0 = Math.floor(height * 0.78);
  const y1 = Math.min(height - 1, Math.floor(height * 0.96));
  const x0 = Math.floor(width * 0.12);
  const x1 = Math.floor(width * 0.88);
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const index = (y * width + x) * 3;
      const r = field[index] ?? 0;
      const g = field[index + 1] ?? 0;
      const b = field[index + 2] ?? 0;
      sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      count += 1;
    }
  }
  return sum / Math.max(1, count) > 0.55 ? DARK_INK : LIGHT_INK;
}
