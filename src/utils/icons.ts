/**
 * Icons the bot draws itself. Player-chosen tag emojis are not in this set.
 * Before Discord application emojis are synced, these fall back to Unicode.
 */

export const ICONS = [
  { key: "skip-back", lucide: "skip-back", fallback: "⏪" },
  { key: "chevron-left", lucide: "chevron-left", fallback: "◀️" },
  { key: "chevron-right", lucide: "chevron-right", fallback: "▶️" },
  { key: "skip-forward", lucide: "skip-forward", fallback: "⏩" },
  { key: "x", lucide: "x", fallback: "❌" },
  { key: "check", lucide: "check", fallback: "✅" },
  { key: "circle-help", lucide: "circle-help", fallback: "❓" },
  { key: "bell", lucide: "bell", fallback: "🔔" },
  { key: "bell-off", lucide: "bell-off", fallback: "🔕" },
  { key: "square", lucide: "square", fallback: "◾" },
  { key: "star", lucide: "star", fallback: "★", fill: true },
  { key: "star-outline", lucide: "star", fallback: "☆" },
  { key: "slot-1", fallback: "1️⃣", glyph: "1" },
  { key: "slot-2", fallback: "2️⃣", glyph: "2" },
  { key: "slot-3", fallback: "3️⃣", glyph: "3" },
  { key: "slot-4", fallback: "4️⃣", glyph: "4" },
] as const;

export type IconKey = (typeof ICONS)[number]["key"];
export type IconSpec = (typeof ICONS)[number];

const live = new Map<string, string>();

export function discordEmojiName(key: IconKey): string {
  return `ak_${key.replaceAll("-", "_")}`;
}

export function installIcons(entries: { key: string; id: string; name: string }[]): void {
  live.clear();
  for (const entry of entries) {
    if (!entry.id || !entry.name) continue;
    live.set(entry.key, `<:${entry.name}:${entry.id}>`);
  }
}

export function icon(key: IconKey): string {
  return live.get(key) ?? ICONS.find((item) => item.key === key)!.fallback;
}

export function iconSpec(key: IconKey): IconSpec {
  return ICONS.find((item) => item.key === key)!;
}
