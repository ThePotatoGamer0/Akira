import { prisma } from "../db/client.js";
import { loadFrame, listFrames } from "../utils/frames.js";
import { DEFAULT_FRAME_ID } from "./balance.js";
import { GameError } from "./errors.js";

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
    throw new GameError("missing-frame", `Akira doesn't have a frame \`${frameId}\`.`);
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
    throw new GameError("missing-frame", `Akira doesn't have a frame \`${frameId}\`.`);
  }
  await prisma.card.update({
    where: { id: card.id },
    data: { frameId },
  });
  return card.id;
}
