import sharp from "sharp";

/**
 * Composite character art under a frame (frame PNG has transparent center).
 */
export async function renderNormalCard(characterPngPath: string, framePngPath: string): Promise<Buffer> {
  const frameBuf = await sharp(framePngPath).ensureAlpha().png().toBuffer();
  const fm = await sharp(frameBuf).metadata();
  const fw = fm.width;
  const fh = fm.height;
  if (!fw || !fh) {
    throw new Error(`Invalid frame dimensions: ${framePngPath}`);
  }

  const charResized = await sharp(characterPngPath)
    .ensureAlpha()
    .resize(fw, fh, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(charResized)
    .composite([{ input: frameBuf, blend: "over" }])
    .png()
    .toBuffer();
}
