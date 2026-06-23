import fs from "node:fs";
import { INIT_LOCK } from "./paths.js";

export function createInitLock(): void {
  fs.writeFileSync(INIT_LOCK, `${Date.now()}\n`, "utf8");
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
