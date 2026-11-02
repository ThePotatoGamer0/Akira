import { Moon, Sun } from "lucide-react";
import type { ThemeLooks } from "../lib/theme.js";

/**
 * A sun and a moon split by a diagonal, for a theme that flips between them.
 * Drawn on Lucide's grid with its stroke so it sits with the icons around it.
 */
function SplitMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden
    >
      <path d="M12 20v2" />
      <path d="M15 9.356a4 4 0 01-5.828 5.472" />
      <path d="M17.5 17.5 19 19" />
      <path d="M20 12h2" />
      <path d="M22 2 2 22" />
      <path d="M3.353 14.5a9 9 0 018.159-11.486c.405-.022.617.46.402.803A6 6 0 0011 7" />
    </svg>
  );
}

/**
 * What a theme looks like, at the size of an inline icon: a moon on dark, a sun
 * on light, and the split for one that switches between them.
 */
export function ThemeMark(props: { looks: ThemeLooks }) {
  if (props.looks === "both") return <SplitMark />;
  return props.looks === "dark" ? <Moon size="1em" aria-hidden /> : <Sun size="1em" aria-hidden />;
}
