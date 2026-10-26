import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import session from "express-session";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type Row = { sess: string; expired: number };

function expiryMs(sess: session.SessionData): number {
  const cookie = sess.cookie;
  if (cookie?.expires) {
    const at = new Date(cookie.expires).getTime();
    if (Number.isFinite(at)) return at;
  }
  const maxAge = cookie?.originalMaxAge;
  if (typeof maxAge === "number" && maxAge > 0) return Date.now() + maxAge;
  return Date.now() + THIRTY_DAYS_MS;
}

/** Keep login cookies next to the game database so a container restart does not sign people out. */
export function sessionDatabasePath(databaseUrl = process.env["DATABASE_URL"] ?? "file:./prisma/akira.db"): string {
  const file = databaseUrl.replace(/^file:/, "").split("?")[0] || "./prisma/akira.db";
  return path.join(path.dirname(file), "sessions.db");
}

export function createSqliteSessionStore(file = sessionDatabasePath()): session.Store {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expired ON sessions (expired);
  `);

  const read = db.prepare("SELECT sess, expired FROM sessions WHERE sid = ?");
  const write = db.prepare(
    "INSERT INTO sessions (sid, sess, expired) VALUES (@sid, @sess, @expired) ON CONFLICT(sid) DO UPDATE SET sess = @sess, expired = @expired",
  );
  const remove = db.prepare("DELETE FROM sessions WHERE sid = ?");
  const prune = db.prepare("DELETE FROM sessions WHERE expired < ?");

  const sweep = (): void => {
    prune.run(Date.now());
  };
  sweep();
  const timer = setInterval(sweep, 60 * 60 * 1000);
  timer.unref();

  class SqliteStore extends session.Store {
    override get(sid: string, callback: (err: Error | null, session?: session.SessionData | null) => void): void {
      try {
        const row = read.get(sid) as Row | undefined;
        if (!row) {
          callback(null, null);
          return;
        }
        if (row.expired < Date.now()) {
          remove.run(sid);
          callback(null, null);
          return;
        }
        callback(null, JSON.parse(row.sess) as session.SessionData);
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }

    override set(sid: string, sess: session.SessionData, callback?: (err?: Error) => void): void {
      try {
        write.run({ sid, sess: JSON.stringify(sess), expired: expiryMs(sess) });
        callback?.();
      } catch (err) {
        callback?.(err instanceof Error ? err : new Error(String(err)));
      }
    }

    override destroy(sid: string, callback?: (err?: Error) => void): void {
      try {
        remove.run(sid);
        callback?.();
      } catch (err) {
        callback?.(err instanceof Error ? err : new Error(String(err)));
      }
    }

    override touch(sid: string, sess: session.SessionData, callback?: (err?: Error) => void): void {
      this.set(sid, sess, callback);
    }
  }

  return new SqliteStore();
}
