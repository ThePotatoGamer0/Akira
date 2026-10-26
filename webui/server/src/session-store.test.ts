import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSqliteSessionStore, sessionDatabasePath } from "./session-store.js";

test("session files sit beside the game database", () => {
  assert.equal(sessionDatabasePath("file:/data/akira.db"), path.join("/data", "sessions.db"));
  assert.equal(sessionDatabasePath("file:./prisma/akira.db"), path.join(".", "prisma", "sessions.db"));
});

test("a login cookie round-trips after the store is opened again", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-sessions-"));
  const file = path.join(dir, "sessions.db");
  const first = createSqliteSessionStore(file);
  await new Promise<void>((resolve, reject) => {
    first.set("sid-1", { cookie: { originalMaxAge: 60_000 }, userId: "player-1" }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  const second = createSqliteSessionStore(file);
  const loaded = await new Promise<{ userId?: string } | null>((resolve, reject) => {
    second.get("sid-1", (err, sess) => {
      if (err) reject(err);
      else resolve(sess ?? null);
    });
  });
  assert.equal(loaded?.userId, "player-1");
});
