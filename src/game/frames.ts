import { prisma } from "../db/client.js";
import { loadFrame, listFrames } from "../utils/frames.js";
import { DEFAULT_FRAME_ID } from "./balance.js";
import { GameError } from "./errors.js";
import { ensureUser } from "./users.js";

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
  10: "ambient",
  12: "celestial",
  13: "arcademachine",
  14: "bloodmoonbite",
  15: "crystalwings",
  16: "deviation",
  17: "explosion",
  18: "glinted",
  19: "labpunk",
  20: "moonaltar",
  21: "samurai",
  22: "spiderlily",
  23: "borealsparkles",
  24: "hacker",
  25: "hauntedthicket",
  26: "phantomslament",
  27: "runic",
  28: "tetromino",
  29: "midnightpetal",
  30: "shoji",
  31: "azureclaw",
  32: "yinandyang",
};

const FRAME_LABELS: Record<number, string> = {
  0: "Dark",
  1: "Yellow",
  2: "White",
  3: "Red",
  4: "Blue",
  5: "Green",
  6: "Pink",
  7: "Purple",
  8: "Orange",
  9: "Teal",
  10: "Ambient",
  12: "Celestial",
  13: "Arcade Machine",
  14: "Blood Moon Bite",
  15: "Crystal Wings",
  16: "Deviation",
  17: "Explosion",
  18: "Glinted",
  19: "Lab Punk",
  20: "Moon Altar",
  21: "Samurai",
  22: "Spider Lily",
  23: "Boreal Sparkles",
  24: "Hacker",
  25: "Haunted Thicket",
  26: "Phantom's Lament",
  27: "Runic",
  28: "Tetromino",
  29: "Midnight Petal",
  30: "Shoji",
  31: "Azure Claw",
  32: "Yin and Yang",
};

/** Short name for a frame. Unknown frames stay as their number. */
export function frameName(id: number): string {
  return FRAME_NAMES[id] ?? String(id);
}

/** Name shown in the WebUI. Command tokens stay the unspaced slug from frameName. */
export function frameLabel(id: number): string {
  return FRAME_LABELS[id] ?? `Frame ${id}`;
}

/** A frame name (`dark`, `yellow`, `pink`) or a frame number. Anything else is not a frame. */
export function parseFrameToken(token: string): number | null {
  const key = token.trim().toLowerCase();
  for (const [id, name] of Object.entries(FRAME_NAMES)) {
    if (name === key) return Number(id);
  }
  if (!/^\d+$/.test(key)) return null;
  return Number(key);
}

/**
 * The frame a card should be drawn with.
 * A frame on the card wins. Then the owner's personal frame. Then the server default.
 */
export function displayFrameId(specific: number | null, serverDefault: number, personalDefault: number | null = null): number {
  if (specific !== null && loadFrame(specific)) return specific;
  if (personalDefault !== null && loadFrame(personalDefault)) return personalDefault;
  if (loadFrame(serverDefault)) return serverDefault;
  return DEFAULT_FRAME_ID;
}

export async function personalDefaultFrame(discordId: string | null): Promise<number | null> {
  if (!discordId) return null;
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { defaultFrameId: true },
  });
  const id = user?.defaultFrameId;
  if (id == null || !loadFrame(id)) return null;
  return id;
}

export async function serverDefaultFrame(guildId: string | null): Promise<number> {
  if (!guildId) return DEFAULT_FRAME_ID;
  const row = await prisma.guildConfig.findUnique({
    where: { guildId },
    select: { defaultFrameId: true },
  });
  return displayFrameId(null, row?.defaultFrameId ?? DEFAULT_FRAME_ID);
}

export function frameIdsOnDisk(): number[] {
  return listFrames().map((frame) => frame.id);
}

export async function setServerDefaultFrame(guildId: string, frameId: number): Promise<void> {
  if (!loadFrame(frameId)) {
    throw new GameError("missing-frame", `Akira doesn't have a frame \`${frameName(frameId)}\`.`);
  }
  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, defaultFrameId: frameId },
    update: { defaultFrameId: frameId },
  });
}

export async function setPersonalDefaultFrame(discordId: string, username: string, frameId: number | null): Promise<void> {
  if (frameId !== null && !loadFrame(frameId)) {
    throw new GameError("missing-frame", `Akira doesn't have a frame \`${frameName(frameId)}\`.`);
  }
  const user = await ensureUser(discordId, username);
  await prisma.user.update({
    where: { id: user.id },
    data: { defaultFrameId: frameId },
  });
}

const FRAME_BATCH = 100;

/** Give several owned cards the same frame. Null sends them back to the personal or server frame. */
export async function setOwnedFrames(discordId: string, cardIds: string[], frameId: number | null): Promise<string[]> {
  if (frameId !== null && !loadFrame(frameId)) {
    throw new GameError("missing-frame", `Akira doesn't have a frame \`${frameName(frameId)}\`.`);
  }
  const ids = [...new Set(cardIds.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  if (ids.length === 0) throw new GameError("cards", "Akira needs a card code for that.");
  if (ids.length > FRAME_BATCH) throw new GameError("limit", "Akira can change 100 cards at once.");
  const user = await prisma.user.findUnique({ where: { discordId }, select: { id: true } });
  if (!user) throw new GameError("missing", "Akira hasn't met you yet.");
  const cards = await prisma.card.findMany({ where: { id: { in: ids } }, select: { id: true, ownerId: true } });
  const byId = new Map(cards.map((card) => [card.id, card]));
  const rejected = ids.filter((id) => byId.get(id)?.ownerId !== user.id);
  if (rejected.length > 0) {
    const listed = rejected.map((id) => `\`${id}\``).join(", ");
    throw new GameError("not-owner", `Akira couldn't frame ${listed}. Those cards aren't yours, or they don't exist.`);
  }
  await prisma.card.updateMany({ where: { id: { in: ids }, ownerId: user.id }, data: { frameId } });
  return ids;
}

export async function setCardFrame(discordId: string, cardId: string, frameId: number | null): Promise<string> {
  const card = await prisma.card.findUnique({
    where: { id: cardId.trim().toLowerCase() },
    include: { owner: true },
  });
  if (!card) {
    throw new GameError("missing", `Akira couldn't find a card with the id \`${cardId}\`.`);
  }
  if (card.owner?.discordId !== discordId) {
    throw new GameError("not-owner", "Akira only changes frames on cards you own.");
  }
  if (frameId !== null && !loadFrame(frameId)) {
    throw new GameError("missing-frame", `Akira doesn't have a frame \`${frameName(frameId)}\`.`);
  }
  await prisma.card.update({
    where: { id: card.id },
    data: { frameId },
  });
  return card.id;
}
