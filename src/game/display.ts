import { icon } from "../utils/icons.js";
import type { Quality } from "./balance.js";

export const DROP_EXPIRED_LINE = "*This drop has expired and the cards can no longer be grabbed.*";

const STARS: Record<Quality, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5,
};

const GRAB_CONDITION: Record<Quality, string> = {
  COMMON: "Unfortunately, it was badly **damaged**.",
  UNCOMMON: "It was in **poor** condition.",
  RARE: "It was in **good** condition.",
  EPIC: "It was in **excellent** condition.",
  LEGENDARY: "It was in **mint** condition.",
};

export function qualityStars(quality: string): string {
  const filled = STARS[quality as Quality] ?? 1;
  return `${icon("star").repeat(filled)}${icon("star-outline").repeat(5 - filled)}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} ${totalSeconds === 1 ? "second" : "seconds"}`;
  }
  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (minutes === 0) return hourLabel;
  return `${hourLabel} ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function cooldownLine(name: string, ms: number): string {
  if (ms <= 0) return `**${name}** is ready`;
  return `**${name}** is available in \`${formatDuration(ms)}\``;
}

export function dropAnnouncement(dropperDiscordId: string, wishlistDiscordIds: string[]): string {
  const lines = [`<@${dropperDiscordId}> is dropping 3 cards!`];
  if (wishlistDiscordIds.length > 0) {
    const mentions = wishlistDiscordIds.map((id) => `<@${id}>`).join(" ");
    lines.push(`${mentions} Akira sees a character you're watching for.`);
  }
  return lines.join("\n\n");
}

export function cardSummaryLine(input: {
  cardId: string;
  quality: string;
  printNumber: number;
  frameId: number;
  seriesName: string;
  characterName: string;
  /** Emoji for this card's tag. Untagged cards use the square icon. */
  tagEmoji?: string;
}): string {
  const mark = input.tagEmoji ?? icon("square");
  return `${mark}\`${input.cardId}\` · ${qualityStars(input.quality)} · #${input.printNumber} · \`${input.frameId}\` · ${input.seriesName} · **${input.characterName}**`;
}

function grabCondition(quality: string): string {
  return GRAB_CONDITION[quality as Quality] ?? GRAB_CONDITION.COMMON;
}

export function grabAnnouncement(input: {
  discordId: string;
  characterName: string;
  cardId: string;
  quality: string;
}): string {
  return `<@${input.discordId}> took the **${input.characterName}** card \`${input.cardId}\`! ${grabCondition(input.quality)}`;
}

export function fightOffAnnouncement(input: {
  dropperDiscordId: string;
  sniperDiscordId: string;
  characterName: string;
  cardId: string;
  quality: string;
}): string {
  return `<@${input.dropperDiscordId}> fought off <@${input.sniperDiscordId}> and took the **${input.characterName}** card \`${input.cardId}\`! ${grabCondition(input.quality)}`;
}
