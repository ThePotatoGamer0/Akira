const ttlMs = 10 * 60 * 1000;

type Entry = { userId: string; expiresAt: number };

const byCode = new Map<string, Entry>();

export function createVerificationCode(userId: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  byCode.set(code, { userId, expiresAt: Date.now() + ttlMs });
  return code;
}

export function consumeVerificationCode(code: string): string | null {
  const e = byCode.get(code.trim());
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    byCode.delete(code);
    return null;
  }
  byCode.delete(code);
  return e.userId;
}

export function peekUserForCode(code: string): string | null {
  const e = byCode.get(code.trim());
  if (!e || Date.now() > e.expiresAt) return null;
  return e.userId;
}
