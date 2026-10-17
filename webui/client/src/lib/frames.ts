export function frameLabel(frames: readonly { id: number; name: string }[], id: number): string {
  return frames.find((frame) => frame.id === id)?.name ?? `Frame ${id}`;
}
