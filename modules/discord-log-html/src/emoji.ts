/**
 * Discord draws standard emoji with Twemoji.
 * Artwork is CC-BY 4.0: https://github.com/jdecked/twemoji
 */
const TWEMOJI = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg";

const EMOJI_AT =
  /^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/u;

export function matchDiscordEmoji(input: string): string | null {
  return EMOJI_AT.exec(input)?.[0] ?? null;
}

/** Twemoji file id. Variation selectors are dropped unless the emoji uses a joiner. */
export function discordEmojiId(emoji: string): string | null {
  if (!matchDiscordEmoji(emoji) || matchDiscordEmoji(emoji) !== emoji) return null;
  const runes = [...emoji].map((char) => char.codePointAt(0) ?? 0);
  const keep = runes.includes(0x200d) ? runes : runes.filter((rune) => rune !== 0xfe0f);
  if (keep.length === 0) return null;
  return keep.map((rune) => rune.toString(16)).join("-");
}

export function discordEmojiUrl(emoji: string): string | null {
  const id = discordEmojiId(emoji);
  return id ? `${TWEMOJI}/${id}.svg` : null;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function discordEmojiImg(emoji: string, className: string): string {
  const url = discordEmojiUrl(emoji);
  if (!url) return escapeAttr(emoji);
  return `<img class="${className}" src="${url}" alt="${escapeAttr(emoji)}" draggable="false">`;
}
