import type { CooldownType } from "../generated/prisma/client.js";
import { prisma } from "../db/client.js";
import { formatDuration } from "./display.js";
import { GameError } from "./errors.js";
import { ensureUser } from "./users.js";

export const REMINDER_ACTIONS = ["daily", "drop", "grab"] as const;
export type ReminderAction = (typeof REMINDER_ACTIONS)[number];

const TYPE_OF: Record<ReminderAction, CooldownType> = {
  daily: "DAILY",
  drop: "DROP",
  grab: "GRAB",
};

export function parseReminderAction(input: string): ReminderAction | null {
  const name = input.trim().toLowerCase();
  if (name === "daily" || name === "drop" || name === "grab") return name;
  return null;
}

export function reminderLabel(action: ReminderAction): string {
  if (action === "daily") return "Daily";
  if (action === "drop") return "Drop";
  return "Grab";
}

export function reminderLine(action: ReminderAction, enabled: boolean, remainingMs: number): string {
  const bell = enabled ? "🔔" : "🔕";
  const label = reminderLabel(action);
  if (remainingMs <= 0) return `${bell} **${label}** is ready`;
  return `${bell} **${label}** is available in \`${formatDuration(remainingMs)}\``;
}

export type ReminderRow = {
  action: ReminderAction;
  enabled: boolean;
  remainingMs: number;
};

export async function listReminders(discordId: string): Promise<ReminderRow[]> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { reminders: true, cooldowns: true },
  });
  const now = Date.now();
  return REMINDER_ACTIONS.map((action) => {
    const type = TYPE_OF[action];
    const cooldown = user?.cooldowns.find((row) => row.type === type);
    const remainingMs = cooldown ? Math.max(0, cooldown.expiresAt.getTime() - now) : 0;
    return {
      action,
      enabled: user?.reminders.some((row) => row.type === type) ?? false,
      remainingMs,
    };
  });
}

export async function toggleReminder(
  discordId: string,
  username: string,
  action: ReminderAction,
): Promise<{ enabled: boolean }> {
  const user = await ensureUser(discordId, username);
  const type = TYPE_OF[action];
  const existing = await prisma.reminder.findUnique({
    where: { userId_type: { userId: user.id, type } },
  });
  if (existing) {
    await prisma.reminder.delete({ where: { id: existing.id } });
    return { enabled: false };
  }
  await prisma.reminder.create({ data: { userId: user.id, type } });
  return { enabled: true };
}

export function unknownReminder(input: string): GameError {
  return new GameError(
    "bad-action",
    `Akira doesn't remind for "${input.trim()}". Choose drop, grab, or daily.`,
  );
}
