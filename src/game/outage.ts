import { prisma } from "../db/client.js";
import { OUTAGE_BITS, OUTAGE_CLAIM_MS, OUTAGE_MIN_MS } from "./balance.js";
import { GameError } from "./errors.js";
import { ensureUser } from "./users.js";

const PRESENCE_ID = "bot";

export type PresenceSnap = {
  beatAt: Date;
  cleanExit: boolean;
};

/** Milliseconds the bot was gone, when that gap should open a claim. */
export function outageGap(row: PresenceSnap | null, now: Date): number | null {
  if (!row || row.cleanExit) return null;
  const gap = now.getTime() - row.beatAt.getTime();
  if (gap < OUTAGE_MIN_MS) return null;
  return gap;
}

export async function noteStartup(now = new Date()): Promise<void> {
  const row = await prisma.botPresence.findUnique({ where: { id: PRESENCE_ID } });
  const gap = outageGap(row, now);
  await prisma.$transaction(async (tx) => {
    if (row && gap !== null) {
      await tx.outage.create({
        data: {
          offlineAt: row.beatAt,
          onlineAt: now,
          bits: OUTAGE_BITS,
          claimUntil: new Date(now.getTime() + OUTAGE_CLAIM_MS),
        },
      });
    }
    await tx.botPresence.upsert({
      where: { id: PRESENCE_ID },
      create: { id: PRESENCE_ID, beatAt: now, cleanExit: false },
      update: { beatAt: now, cleanExit: false },
    });
  });
}

export async function beat(now = new Date()): Promise<void> {
  await prisma.botPresence.upsert({
    where: { id: PRESENCE_ID },
    create: { id: PRESENCE_ID, beatAt: now, cleanExit: false },
    update: { beatAt: now, cleanExit: false },
  });
}

export async function markCleanExit(now = new Date()): Promise<void> {
  await prisma.botPresence.upsert({
    where: { id: PRESENCE_ID },
    create: { id: PRESENCE_ID, beatAt: now, cleanExit: true },
    update: { beatAt: now, cleanExit: true },
  });
}

export async function claimOutage(
  discordId: string,
  username: string,
  now = new Date(),
): Promise<{ awarded: number; balance: number }> {
  const user = await ensureUser(discordId, username);
  return prisma.$transaction(async (tx) => {
    const open = await tx.outage.findMany({
      where: { claimUntil: { gt: now } },
      orderBy: { onlineAt: "asc" },
    });
    if (open.length === 0) {
      throw new GameError("no-outage", "Akira doesn't owe you any bits right now.");
    }
    const claimed = await tx.outageClaim.findMany({
      where: { userId: user.id, outageId: { in: open.map((outage) => outage.id) } },
      select: { outageId: true },
    });
    const have = new Set(claimed.map((row) => row.outageId));
    const fresh = open.filter((outage) => !have.has(outage.id));
    if (fresh.length === 0) {
      throw new GameError("already-claimed", "You already claimed the bits from that outage.");
    }
    const awarded = fresh.reduce((sum, outage) => sum + outage.bits, 0);
    await tx.outageClaim.createMany({
      data: fresh.map((outage) => ({ outageId: outage.id, userId: user.id })),
    });
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { bits: { increment: awarded } },
      select: { bits: true },
    });
    return { awarded, balance: updated.bits };
  });
}

const BEAT_MS = 60 * 1000;

export function startOutageWatch(): void {
  void noteStartup().catch((err) => console.error("Outage check failed.", err));
  const timer = setInterval(() => {
    void beat().catch((err) => console.error("Outage heartbeat failed.", err));
  }, BEAT_MS);
  timer.unref?.();

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    void markCleanExit()
      .catch((err) => console.error("Outage shutdown mark failed.", err))
      .finally(() => process.exit(0));
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
