import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DIR_INPUT_FRAMES = path.join(process.cwd(), "input", "frames");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function generateFrames() {
  ensureDir(DIR_INPUT_FRAMES);

  // A thinner border and a solid lower section (chin) for the character's name
  const frameSvg = `
    <svg width="400" height="600">
      <rect x="5" y="5" width="390" height="590" fill="none" stroke="gold" stroke-width="10" rx="15" />
      <path d="M 5 520 L 395 520 L 395 580 A 15 15 0 0 1 380 595 L 20 595 A 15 15 0 0 1 5 580 Z" fill="gold" />
    </svg>
  `;

  console.log("Generating placeholder frame PNG...");

  await sharp(Buffer.from(frameSvg))
    .png()
    .toFile(path.join(DIR_INPUT_FRAMES, "frame_1.png"));

  console.log("Done! frame_1.png is ready.");
}

generateFrames().catch(console.error);