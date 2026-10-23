import fs from "node:fs";
import { INIT_LOCK } from "./paths.js";

export function createInitLock(): void {
  fs.writeFileSync(INIT_LOCK, `${Date.now()}\n`, "utf8");
}

/** True when this call created the lock. False when Akira is already paused. */
export function tryCreateInitLock(): boolean {
  try {
    fs.writeFileSync(INIT_LOCK, `${Date.now()}\n`, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return false;
    throw err;
  }
}

export function removeInitLock(): void {
  try {
    fs.unlinkSync(INIT_LOCK);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw e;
  }
}

export function isInitLocked(): boolean {
  return fs.existsSync(INIT_LOCK);
}
