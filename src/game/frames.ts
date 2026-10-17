import { prisma } from "../db/client.js";
import { loadFrame, listFrames } from "../utils/frames.js";
import { DEFAULT_FRAME_ID } from "./balance.js";
import { GameError } from "./errors.js";

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
};

/** Short name for a frame. Unknown frames stay as their number. */
export function frameName(id: number): string {
  return FRAME_NAMES[id] ?? String(id);
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

/** The frame a card should be drawn with. A chosen frame wins. Otherwise the server default. */
export function displayFrameId(specific: number | null, serverDefault: number): number {
  if (specific !== null && loadFrame(specific)) return specific;
  if (loadFrame(serverDefault)) return serverDefault;
  return DEFAULT_FRAME_ID;
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
