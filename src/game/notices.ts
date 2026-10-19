import type { CooldownType } from "../generated/prisma/client.js";
import { prisma } from "../db/client.js";
import { reminderLabel, type ReminderAction } from "./reminders.js";

const ACTION: Record<CooldownType, ReminderAction> = {
  DAILY: "daily",
  DROP: "drop",
  GRAB: "grab",
};

/** Same sentence the Discord DM uses, without the bold markers. */
export function cooldownNoticeText(type: CooldownType): string {
  return `${reminderLabel(ACTION[type])} is ready.`;
}

export type NoticeView = {
  id: string;
  type: CooldownType;
  body: string;
  createdAt: string;
  readAt: string | null;
};

const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

/** Leave a WebUI note for a cooldown ping. Old read notes are dropped. */
export async function recordCooldownNotice(userId: string, type: CooldownType): Promise<void> {
  await prisma.notice.deleteMany({
    where: { userId, readAt: { not: null }, createdAt: { lt: new Date(Date.now() - KEEP_MS) } },
  });
  await prisma.notice.create({
    data: { userId, type, body: cooldownNoticeText(type) },
  });
}

export async function listNotices(userId: string): Promise<NoticeView[]> {
  const rows = await prisma.notice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }));
}

export async function markNoticeRead(userId: string, id: string): Promise<boolean> {
  const row = await prisma.notice.findFirst({ where: { id, userId } });
  if (!row) return false;
  if (!row.readAt) {
    await prisma.notice.update({ where: { id: row.id }, data: { readAt: new Date() } });
  }
  return true;
}

export async function markNoticesRead(userId: string): Promise<void> {
  await prisma.notice.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
