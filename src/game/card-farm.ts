import { timingSafeEqual, randomBytes } from "node:crypto";
import type { FarmRedrawJob } from "./card-cache.js";

export const FARM_CLAIM_STALE_MS = 10 * 60 * 1000;
export const FARM_WAIT_MS = 20 * 60 * 1000;
export const FARM_MAX_MS = 4 * 60 * 60 * 1000;

export type FarmStatus = {
  status: "waiting" | "working" | "done" | "cancelled";
  startedAt: number;
  totalFiles: number;
  doneFiles: number;
  redrawn: number;
  skipped: number;
  pendingJobs: number;
  claimedJobs: number;
};

type Slot = FarmRedrawJob & {
  state: "pending" | "claimed" | "done";
  claimedAt: number | null;
};

type Session = {
  token: string;
  startedAt: number;
  skippedAtStart: number;
  slots: Slot[];
  redrawn: number;
  skipped: number;
  doneFiles: number;
  totalFiles: number;
  cancelled: boolean;
  seenWorker: boolean;
};

let session: Session | null = null;

function tokenBuffer(value: string): Buffer {
  return Buffer.from(value);
}

export function tokensMatch(left: string, right: string): boolean {
  const a = tokenBuffer(left.trim().toUpperCase());
  const b = tokenBuffer(right.trim().toUpperCase());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newFarmToken(): string {
  const bytes = randomBytes(8);
  let token = "";
  for (const byte of bytes) token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
  return token;
}

function reclaim(now: number): void {
  if (!session) return;
  for (const slot of session.slots) {
    if (slot.state !== "claimed" || slot.claimedAt === null) continue;
    if (now - slot.claimedAt < FARM_CLAIM_STALE_MS) continue;
    slot.state = "pending";
    slot.claimedAt = null;
  }
}

function snapshot(): FarmStatus {
  const now = Date.now();
  reclaim(now);
  if (!session) {
    return {
      status: "cancelled",
      startedAt: 0,
      totalFiles: 0,
      doneFiles: 0,
      redrawn: 0,
      skipped: 0,
      pendingJobs: 0,
      claimedJobs: 0,
    };
  }
  let pendingJobs = 0;
  let claimedJobs = 0;
  for (const slot of session.slots) {
    if (slot.state === "pending") pendingJobs += 1;
    if (slot.state === "claimed") claimedJobs += 1;
  }
  let status: FarmStatus["status"] = "waiting";
  if (session.cancelled) status = "cancelled";
  else if (pendingJobs === 0 && claimedJobs === 0) status = "done";
  else if (session.seenWorker || claimedJobs > 0) status = "working";
  return {
    status,
    startedAt: session.startedAt,
    totalFiles: session.totalFiles,
    doneFiles: session.doneFiles,
    redrawn: session.redrawn,
    skipped: session.skipped,
    pendingJobs,
    claimedJobs,
  };
}

export function startFarmSession(jobs: FarmRedrawJob[], skippedAtStart: number, totalFiles: number, token: string): FarmStatus {
  session = {
    token,
    startedAt: Date.now(),
    skippedAtStart,
    slots: jobs.map((job) => ({ ...job, state: "pending", claimedAt: null })),
    redrawn: 0,
    skipped: skippedAtStart,
    doneFiles: skippedAtStart,
    totalFiles,
    cancelled: false,
    seenWorker: false,
  };
  return snapshot();
}

export function farmHasSession(): boolean {
  return session !== null && !session.cancelled;
}

export function farmTokenOk(token: string): boolean {
  return session !== null && !session.cancelled && tokensMatch(session.token, token);
}

export function peekFarmJob(jobId: number): FarmRedrawJob | null {
  if (!session || session.cancelled) return null;
  const slot = session.slots.find((item) => item.id === jobId);
  if (!slot || slot.state !== "claimed") return null;
  return { id: slot.id, group: slot.group, variant: slot.variant };
}

export function farmStatus(): FarmStatus | null {
  if (!session) return null;
  return snapshot();
}

export function claimFarmJobs(token: string, count: number): FarmRedrawJob[] | null {
  if (!farmTokenOk(token) || !session) return null;
  reclaim(Date.now());
  session.seenWorker = true;
  const take = Math.max(1, Math.floor(count) || 1);
  const claimed: FarmRedrawJob[] = [];
  const now = Date.now();
  for (const slot of session.slots) {
    if (claimed.length >= take) break;
    if (slot.state !== "pending") continue;
    slot.state = "claimed";
    slot.claimedAt = now;
    claimed.push({ id: slot.id, group: slot.group, variant: slot.variant });
  }
  return claimed;
}

export function finishFarmJob(token: string, jobId: number, result: { redrawn: number; skipped: number }): FarmStatus | null {
  if (!farmTokenOk(token) || !session) return null;
  const slot = session.slots.find((item) => item.id === jobId);
  if (!slot || slot.state === "done") return snapshot();
  slot.state = "done";
  slot.claimedAt = null;
  session.redrawn += result.redrawn;
  session.skipped += result.skipped;
  session.doneFiles += result.redrawn + result.skipped;
  return snapshot();
}

export function cancelFarmSession(): FarmStatus | null {
  if (!session) return null;
  session.cancelled = true;
  const view = snapshot();
  session = null;
  return view;
}

export function clearFarmSession(): void {
  session = null;
}
