const FRAME_NAMES: Record<number, string> = {
  0: "dark",
  1: "yellow",
  2: "white",
  3: "red",
  4: "blue",
  5: "green",
  6: "pink",
  7: "purple",
  8: "orange",
  9: "teal",
};

export function frameLabel(id: number): string {
  const name = FRAME_NAMES[id] ?? `frame ${id}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
