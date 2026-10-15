import fs from "node:fs";
import path from "node:path";
import { DIR_INPUT_FRAMES } from "./paths.js";

export type TextAnchorH = "left" | "center" | "right";
export type TextAnchorV = "top" | "center" | "bottom";

export type TextStyle = {
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  horizontalAnchor: TextAnchorH;
  verticalAnchor: TextAnchorV;
};

export type FrameAsset = {
  id: number;
  imagePath: string;
  characterName: TextStyle | null;
  seriesName: TextStyle | null;
  printNumber: TextStyle | null;
};

type RawText = {
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  "horizontal-anchor"?: string;
  "vertical-anchor"?: string;
};

function anchorH(value: string | undefined): TextAnchorH {
  if (value === "left" || value === "right" || value === "center") return value;
  return "left";
}

function anchorV(value: string | undefined): TextAnchorV {
  if (value === "top" || value === "center" || value === "bottom") return value;
  return "top";
}

function readStyle(raw: RawText | undefined): TextStyle | null {
  if (!raw || typeof raw.x !== "number" || typeof raw.y !== "number") return null;
  return {
    x: raw.x,
    y: raw.y,
    fontSize: typeof raw.fontSize === "number" ? raw.fontSize : 24,
    fontFamily: raw.fontFamily ?? "sans-serif",
    color: raw.color ?? "#FFFFFF",
    horizontalAnchor: anchorH(raw["horizontal-anchor"]),
    verticalAnchor: anchorV(raw["vertical-anchor"]),
  };
}

export function loadFrame(id: number): FrameAsset | null {
  if (!Number.isInteger(id) || id < 0) return null;
  const dir = path.join(DIR_INPUT_FRAMES, String(id));
  const imagePath = path.join(dir, "frame.png");
  if (!fs.existsSync(imagePath)) return null;

  let characterName: TextStyle | null = null;
  let seriesName: TextStyle | null = null;
  let printNumber: TextStyle | null = null;
  const configPath = path.join(dir, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        textElements?: { characterName?: RawText; seriesName?: RawText; printNumber?: RawText };
      };
      characterName = readStyle(parsed.textElements?.characterName);
      seriesName = readStyle(parsed.textElements?.seriesName);
      printNumber = readStyle(parsed.textElements?.printNumber);
    } catch (err) {
      console.error(`Akira couldn't read the frame config at ${configPath}:`, err);
    }
  }

  return { id, imagePath, characterName, seriesName, printNumber };
}

export function listFrames(): FrameAsset[] {
  if (!fs.existsSync(DIR_INPUT_FRAMES)) return [];
  const frames: FrameAsset[] = [];
  for (const name of fs.readdirSync(DIR_INPUT_FRAMES)) {
    if (!/^\d+$/.test(name)) continue;
    const frame = loadFrame(Number(name));
    if (frame) frames.push(frame);
  }
  return frames.sort((a, b) => a.id - b.id);
}
