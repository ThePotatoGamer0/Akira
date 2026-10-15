import { Square, Star } from "lucide-react";

const FILLED: Record<string, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5,
};

/** The mark the API sends when a card has no tag. */
const UNTAGGED = "◾";

export function QualityStars(props: { quality: string; size?: number }) {
  const filled = FILLED[props.quality] ?? 1;
  const size = props.size ?? 13;
  return (
    <span className="quality-stars" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={size}
          strokeWidth={2}
          fill={index < filled ? "currentColor" : "none"}
          className={index < filled ? "quality-stars__on" : "quality-stars__off"}
        />
      ))}
    </span>
  );
}

export function TagMark(props: { emoji?: string | null; size?: number }) {
  const emoji = props.emoji?.trim();
  if (!emoji || emoji === UNTAGGED) {
    return <Square className="tag-mark" size={props.size ?? 13} strokeWidth={2} aria-hidden />;
  }
  return <span className="tag-emoji">{emoji}</span>;
}
