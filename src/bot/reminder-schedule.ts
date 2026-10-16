import type { Client } from "discord.js";
import type { CooldownType } from "../generated/prisma/client.js";
import { prisma } from "../db/client.js";
import { reminderLabel, type ReminderAction } from "../game/reminders.js";
import { REMINDER_DM_TTL_MS, rememberEphemeralDm } from "./dm-mailbox.js";

const LABEL: Record<CooldownType, ReminderAction> = {
  DAILY: "daily",
  DROP: "drop",
  GRAB: "grab",
};

const timers = new Map<string, NodeJS.Timeout>();
let bound: Client | null = null;

function timerKey(discordId: string, type: CooldownType): string {
  return `${discordId}:${type}`;
}

export function bindReminderClient(client: Client): void {
  bound = client;
}

function cancel(discordId: string, type: CooldownType): void {
  const key = timerKey(discordId, type);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.delete(key);
}

function arm(discordId: string, type: CooldownType, expiresAt: Date): void {
  cancel(discordId, type);
  const delay = expiresAt.getTime() - Date.now();
  if (delay <= 0 || !bound) return;
  const timer = setTimeout(() => {
    timers.delete(timerKey(discordId, type));
    void deliver(discordId, type);
  }, delay);
  timers.set(timerKey(discordId, type), timer);
}

async function deliver(discordId: string, type: CooldownType): Promise<void> {
  if (!bound) return;
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { reminders: true, cooldowns: true },
  });
  if (!user?.reminders.some((row) => row.type === type)) return;
  const cooldown = user.cooldowns.find((row) => row.type === type);
  if (cooldown && cooldown.expiresAt.getTime() > Date.now() + 1500) {
    arm(discordId, type, cooldown.expiresAt);
    return;
  }
  try {
    const discordUser = await bound.users.fetch(discordId);
    const label = reminderLabel(LABEL[type]);
    const sent = await discordUser.send(`**${label}** is ready.`);
    await rememberEphemeralDm(sent, new Date(Date.now() + REMINDER_DM_TTL_MS));
  } catch (err) {
    console.error(`Akira couldn't ping ${discordId} about ${type}:`, err);
  }
}

/** Schedule a DM if this player asked to be pinged for that cooldown. */
export async function queueCooldownReminder(discordId: string, type: CooldownType): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { reminders: true, cooldowns: true },
  });
  if (!user || !user.reminders.some((row) => row.type === type)) {
    cancel(discordId, type);
    return;
  }
  const cooldown = user.cooldowns.find((row) => row.type === type);
  if (!cooldown || cooldown.expiresAt.getTime() <= Date.now()) {
    cancel(discordId, type);
    return;
  }
  arm(discordId, type, cooldown.expiresAt);
}

export async function resumeReminders(): Promise<void> {
  const rows = await prisma.reminder.findMany({
    include: { user: { include: { cooldowns: true } } },
  });
  for (const row of rows) {
    const cooldown = row.user.cooldowns.find((item) => item.type === row.type);
    if (!cooldown || cooldown.expiresAt.getTime() <= Date.now()) continue;
    arm(row.user.discordId, row.type, cooldown.expiresAt);
  }
}
