import sharp from "sharp";

/**
 * A cheap color wash of the card art. Shrink until the picture is only color,
 * then stretch it back over the polaroid. No per-pixel warp.
 */

const LIGHT_INK = { name: "#F4F5F7", series: "#A3A8B0", print: "#8E939C" };
const DARK_INK = { name: "#1C1914", series: "#4A4332", print: "#5A5140" };

export type AmbientInk = { name: string; series: string; print: string };

/** RGB color field, 3 channels, covering `width` by `height`. */
export async function ambientField(artPath: string, width: number, height: number): Promise<Buffer> {
  return sharp(artPath)
    .resize(width, height, { fit: "cover", position: "centre" })
    .resize(8, 12, { fit: "fill" })
    .resize(width, height, { kernel: "lanczos3" })
    .blur(16)
    .modulate({ brightness: 0.92 })
    .removeAlpha()
    .raw()
    .toBuffer();
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
