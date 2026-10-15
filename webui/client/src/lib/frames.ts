const FRAME_NAMES: Record<number, string> = {
  0: "dark",
  1: "yellow",
};

export function frameLabel(id: number): string {
  const name = FRAME_NAMES[id] ?? `frame ${id}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
