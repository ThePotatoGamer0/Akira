import type { BuffKind } from "./buffs.js";

/** One poll answer and how many votes it took. */
export type PollAnswer = { id: number; text: string; voteCount: number };

function kindOf(text: string): BuffKind | null {
  const clean = text.toLowerCase();
  if (clean.includes("tracked pull")) return "tracked_pull";
  if (clean.includes("four cards")) return "four_cards";
  if (clean.includes("quality over quantity")) return "quality_over_quantity";
  if (clean.includes("featured series")) return "featured_series";
  if (clean.includes("shiny luck")) return "shiny_luck";
  if (clean.includes("burn value")) return "burn_value";
  if (clean.includes("drop cooldown")) return "drop_cooldown";
  if (clean.includes("grab cooldown")) return "grab_cooldown";
  return null;
}

/**
 * The buffs the poll sends into tonight's roll, most voted first. Ties go to the
 * answer listed first, the same order Discord shows them. An answer nobody can
 * place is skipped rather than fizzling the poll.
 */
export function pollWinners(labels: readonly string[], counts: readonly PollAnswer[] | null | undefined, slots: number): BuffKind[] {
  if (slots <= 0 || !counts) return [];
  const sorted = [...counts]
    .map((row) => ({ ...row, label: labels[row.id] ?? row.text }))
    .sort((left, right) => right.voteCount - left.voteCount || left.id - right.id);
  const winners: BuffKind[] = [];
  for (const row of sorted) {
    if (row.voteCount <= 0) break;
    const kind = kindOf(row.label);
    if (!kind || winners.includes(kind)) continue;
    winners.push(kind);
    if (winners.length >= slots) break;
  }
  return winners;
}
