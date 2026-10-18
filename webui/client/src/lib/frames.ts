const FRAME_LABELS: Record<number, string> = {
  0: "Dark",
  1: "Yellow",
  2: "White",
  3: "Red",
  4: "Blue",
  5: "Green",
  6: "Pink",
  7: "Purple",
  8: "Orange",
  9: "Teal",
  10: "Ambient",
  12: "Celestial",
  13: "Arcade Machine",
  14: "Blood Moon Bite",
  15: "Crystal Wings",
  16: "Deviation",
  17: "Explosion",
  18: "Glinted",
  19: "Lab Punk",
  20: "Moon Altar",
  21: "Samurai",
  22: "Spider Lily",
  23: "Boreal Sparkles",
  24: "Hacker",
  25: "Haunted Thicket",
  26: "Phantom's Lament",
  27: "Runic",
  28: "Tetromino",
  29: "Midnight Petal",
  30: "Shoji",
  31: "Azure Claw",
  32: "Yin and Yang",
};

/** Plaque's old id. It is not a frame. */
const RETIRED_FRAME_IDS = new Set([11]);

export type StudioFrame = { id: number; name: string };

function frameIdOf(entry: unknown): number | null {
  if (typeof entry === "number" && Number.isInteger(entry)) return entry;
  if (!entry || typeof entry !== "object" || !("id" in entry)) return null;
  const id = entry.id;
  return typeof id === "number" && Number.isInteger(id) ? id : null;
}

function frameNameOf(entry: unknown, id: number): string {
  if (entry && typeof entry === "object" && "name" in entry && typeof entry.name === "string" && entry.name.trim()) {
    return entry.name;
  }
  return FRAME_LABELS[id] ?? `Frame ${id}`;
}

/** Accepts a list of ids or `{ id, name }` rows, and drops plaque. */
export function studioFrames(raw: unknown): StudioFrame[] {
  if (!Array.isArray(raw)) return [];
  const frames: StudioFrame[] = [];
  for (const entry of raw) {
    const id = frameIdOf(entry);
    if (id === null || id < 0 || RETIRED_FRAME_IDS.has(id)) continue;
    frames.push({ id, name: frameNameOf(entry, id) });
  }
  return frames;
}

export function frameLabel(frames: readonly StudioFrame[], id: number): string {
  if (RETIRED_FRAME_IDS.has(id)) return "Server frame";
  return frames.find((frame) => frame.id === id)?.name ?? FRAME_LABELS[id] ?? `Frame ${id}`;
}
