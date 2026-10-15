import { prisma } from "../db/client.js";
import { icon } from "../utils/icons.js";
import { GameError } from "./errors.js";
import { ensureUser, findUserByDiscordId } from "./users.js";

/** Shown on the left of a card that has no tag. */
export const UNTAGGED_EMOJI = "◾";

const TAG_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase();
}

export function assertTagName(raw: string): string {
  const name = normalizeTagName(raw);
  if (!TAG_NAME.test(name)) {
    throw new GameError("name", "Tag names are one word: letters, numbers, - and _.");
  }
  return name;
}

function assertEmoji(raw: string): string {
  const emoji = raw.trim();
  if (!emoji || /\s/.test(emoji) || emoji.length > 64 || /^<a?:[a-zA-Z0-9_]+:\d+>$/.test(emoji)) {
    throw new GameError("emoji", "That emoji doesn't work as a tag. Server emojis aren't allowed.");
  }
  return emoji;
}

export async function tagEmojisForDiscord(discordId: string): Promise<Map<string, string>> {
  const user = await findUserByDiscordId(discordId);
  if (!user) return new Map();
  const tags = await prisma.tag.findMany({ where: { userId: user.id } });
  return new Map(tags.map((tag) => [tag.name, tag.emoji]));
}

export function emojiForTag(tags: Map<string, string>, tagName: string | null): string {
  if (!tagName) return icon("square");
  return tags.get(tagName) ?? icon("square");
}

export async function createTag(discordId: string, username: string, rawName: string, rawEmoji: string) {
  const name = assertTagName(rawName);
  const emoji = assertEmoji(rawEmoji);
  const user = await ensureUser(discordId, username);
  const existing = await prisma.tag.findUnique({ where: { userId_name: { userId: user.id, name } } });
  if (existing) throw new GameError("duplicate", `You already have a tag named **${name}**.`);
  return prisma.tag.create({ data: { userId: user.id, name, emoji } });
}

export async function deleteTag(discordId: string, username: string, rawName: string) {
  const name = assertTagName(rawName);
  const user = await ensureUser(discordId, username);
  const tag = await prisma.tag.findUnique({ where: { userId_name: { userId: user.id, name } } });
  if (!tag) throw new GameError("missing", `You don't have a tag named **${name}**.`);
  await prisma.$transaction([
    prisma.card.updateMany({ where: { ownerId: user.id, tag: name }, data: { tag: null } }),
    prisma.tag.delete({ where: { id: tag.id } }),
  ]);
  return tag;
}

export async function listTags(discordId: string) {
  const user = await findUserByDiscordId(discordId);
  if (!user) return { tags: [], untagged: 0 };
  const [tags, grouped] = await Promise.all([
    prisma.tag.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.card.groupBy({ by: ["tag"], where: { ownerId: user.id }, _count: { _all: true } }),
  ]);
  const counts = new Map(grouped.map((row) => [row.tag, row._count._all]));
  return {
    untagged: counts.get(null) ?? 0,
    tags: tags.map((tag) => ({ name: tag.name, emoji: tag.emoji, count: counts.get(tag.name) ?? 0 })),
  };
}

const taggedInclude = {
  variant: { include: { character: { include: { series: true } } } },
} as const;

export async function applyTag(discordId: string, username: string, rawName: string, cardIds: string[]) {
  const name = assertTagName(rawName);
  const user = await ensureUser(discordId, username);
  const tag = await prisma.tag.findUnique({ where: { userId_name: { userId: user.id, name } } });
  if (!tag) throw new GameError("missing", `You don't have a tag named **${name}**.`);
  const ids = [...new Set(cardIds.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  if (ids.length === 0) throw new GameError("cards", "Akira needs a card code for that.");
  const cards = await prisma.card.findMany({ where: { id: { in: ids } }, include: taggedInclude });
  const byId = new Map(cards.map((card) => [card.id, card]));
  const rejected = ids.filter((id) => byId.get(id)?.ownerId !== user.id);
  if (rejected.length > 0) {
    const listed = rejected.map((id) => `\`${id}\``).join(", ");
    throw new GameError("not-owner", `Akira couldn't tag ${listed}. Those cards aren't yours, or they don't exist.`);
  }
  await prisma.card.updateMany({ where: { id: { in: ids }, ownerId: user.id }, data: { tag: name } });
  return {
    tag,
    cards: ids.map((id) => {
      const card = byId.get(id)!;
      return { ...card, tag: name };
    }),
  };
}

export async function clearTag(discordId: string, username: string, cardIds: string[]) {
  const user = await ensureUser(discordId, username);
  const ids = [...new Set(cardIds.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  if (ids.length === 0) throw new GameError("cards", "Akira needs a card code for that.");
  const cards = await prisma.card.findMany({ where: { id: { in: ids } }, include: taggedInclude });
  const byId = new Map(cards.map((card) => [card.id, card]));
  const rejected = ids.filter((id) => byId.get(id)?.ownerId !== user.id);
  if (rejected.length > 0) {
    const listed = rejected.map((id) => `\`${id}\``).join(", ");
    throw new GameError("not-owner", `Akira couldn't untag ${listed}. Those cards aren't yours, or they don't exist.`);
  }
  await prisma.card.updateMany({ where: { id: { in: ids }, ownerId: user.id }, data: { tag: null } });
  return ids.map((id) => {
    const card = byId.get(id)!;
    return { ...card, tag: null };
  });
}
