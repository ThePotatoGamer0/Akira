import { DEFAULT_RATE_LIMIT_MS, TRADE_RATE_LIMIT_MS } from "../game/balance.js";
import type { AkiraCommand } from "../types/commands.js";

/**
 * Per-player command throttle. In memory on purpose: it only has to hold for a few seconds,
 * so it needs no table and cannot fail a command if a write goes wrong.
 */
const nextAllowed = new Map<string, number>();
const SWEEP_EVERY = 500;
let sinceSweep = 0;

/** Trade offers are the slow ones; everything else shares the default. */
const TRADE_COMMANDS = new Set(["trade", "multitrade", "give"]);

/** `/ping` has to answer at any time, so it never waits. */
const EXEMPT = new Set(["ping"]);

export function rateLimitFor(command: AkiraCommand): number | null {
  if (command.rateLimitMs !== undefined) return command.rateLimitMs;
  const name = command.data.name;
  if (EXEMPT.has(name)) return null;
  if (TRADE_COMMANDS.has(name)) return TRADE_RATE_LIMIT_MS;
  return DEFAULT_RATE_LIMIT_MS;
}

function sweep(now: number): void {
  sinceSweep += 1;
  if (sinceSweep < SWEEP_EVERY) return;
  sinceSweep = 0;
  for (const [key, until] of nextAllowed) {
    if (until <= now) nextAllowed.delete(key);
  }
}

/** True when this player may run the command now. Records the wait when they may. */
export function allowCommand(userId: string, command: AkiraCommand, now = Date.now()): boolean {
  const limit = rateLimitFor(command);
  if (limit === null || limit <= 0) return true;
  const key = `${userId}:${command.data.name}`;
  const until = nextAllowed.get(key);
  if (until !== undefined && until > now) return false;
  nextAllowed.set(key, now + limit);
  sweep(now);
  return true;
}

/** Tests only: forget every throttle. */
export function resetRateLimits(): void {
  nextAllowed.clear();
  sinceSweep = 0;
}
