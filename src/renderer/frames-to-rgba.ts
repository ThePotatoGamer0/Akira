import sharp from "sharp";

export async function pngBufferToRgba(buf: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error("Expected RGBA after ensureAlpha");
  }
  return Buffer.from(data);
}
