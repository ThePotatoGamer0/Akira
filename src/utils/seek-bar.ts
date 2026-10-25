import { createCanvas } from "canvas";

/** Discord draws these inline at 32×32. Source art is 2× that so the curve stays smooth. */
export const BAR_CELL_PX = 32;
export const BAR_SOURCE_PX = 64;
export const BAR_PAD_Y = 16;
export const BAR_HEIGHT = 34;
export const BAR_RADIUS = BAR_HEIGHT / 2;
/** Cap radius in display pixels, floored. Spill past a cell edge is this many 32×32 pixels. */
export const BAR_OVERHANG_PX = Math.floor(BAR_RADIUS / (BAR_SOURCE_PX / BAR_CELL_PX));

const FILL = "rgb(124, 77, 255)";
const EMPTY = "rgb(61, 47, 90)";
const EXTEND = 256;

export type BarRole = "start" | "mid" | "end";
export type BarFill = number | "full";

export type BarTile = {
  role: BarRole;
  fill: BarFill;
};

export type BarIconSpec = {
  key: string;
  fallback: string;
  bar: BarTile;
};

type BarContext = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

function stadiumPath(ctx: BarContext, x: number, y: number, w: number, h: number): boolean {
  if (w <= 0) return false;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(h / 2, w / 2));
  return true;
}

function fillStadium(ctx: BarContext, x: number, y: number, w: number, h: number, color: string): void {
  if (!stadiumPath(ctx, x, y, w, h)) return;
  ctx.fillStyle = color;
  ctx.fill();
}

function trackLeft(role: BarRole): number {
  return role === "start" ? 0 : -EXTEND;
}

function trackRight(role: BarRole): number {
  return role === "end" ? BAR_SOURCE_PX : BAR_SOURCE_PX + EXTEND;
}

function fillRight(tile: BarTile): number | null {
  if (tile.fill === "full") {
    return tile.role === "end" ? BAR_SOURCE_PX : BAR_SOURCE_PX + EXTEND;
  }
  if (tile.fill <= 0) return null;
  return tile.fill * (BAR_SOURCE_PX / BAR_CELL_PX);
}

export function barIconKey(role: BarRole, fill: BarFill): string {
  if (fill === "full") return `bar-${role}-full`;
  return `bar-${role}-${fill}`;
}

export function barCellKey(role: BarRole, localDisplay: number): string {
  if (role === "end") {
    return barIconKey(role, Math.min(BAR_CELL_PX, Math.max(0, Math.round(localDisplay))));
  }
  const stepped = Math.round(localDisplay);
  if (stepped <= 0) return barIconKey(role, 0);
  if (stepped <= BAR_CELL_PX + BAR_OVERHANG_PX) return barIconKey(role, stepped);
  return barIconKey(role, "full");
}

export function allBarIconSpecs(): BarIconSpec[] {
  const specs: BarIconSpec[] = [];
  const add = (role: BarRole, fill: BarFill): void => {
    const lit = fill === "full" || (typeof fill === "number" && fill > 0);
    specs.push({ key: barIconKey(role, fill), fallback: lit ? "▰" : "▱", bar: { role, fill } });
  };
  for (const role of ["start", "mid"] as const) {
    for (let fill = 0; fill <= BAR_CELL_PX + BAR_OVERHANG_PX; fill += 1) add(role, fill);
    add(role, "full");
  }
  for (let fill = 0; fill <= BAR_CELL_PX; fill += 1) add("end", fill);
  return specs;
}

export const BAR_ICONS = allBarIconSpecs();

/** Drawn at icon-sync and uploaded. These tiles are not stored as PNGs. */
export function renderSeekBarPng(tile: BarTile): Buffer {
  const canvas = createCanvas(BAR_SOURCE_PX, BAR_SOURCE_PX);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, BAR_SOURCE_PX, BAR_SOURCE_PX);
  const y = BAR_PAD_Y;
  const h = BAR_HEIGHT;
  const left = trackLeft(tile.role);
  const trackW = trackRight(tile.role) - left;
  fillStadium(ctx, left, y, trackW, h, EMPTY);
  const right = fillRight(tile);
  if (right !== null) {
    const fillLeft = tile.role === "start" ? 0 : -EXTEND;
    ctx.save();
    stadiumPath(ctx, left, y, trackW, h);
    ctx.clip();
    fillStadium(ctx, fillLeft, y, right - fillLeft, h, FILL);
    ctx.restore();
  }
  return canvas.toBuffer("image/png");
}
