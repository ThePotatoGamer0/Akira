import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitLock, removeInitLock } from "../utils/init-lock.js";
import { registerSlashCommands } from "./register-commands.js";
import { runGenerator } from "./generator/index.js";
import { seedCatalog } from "./seeder/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function runMigrations(): void {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

async function main(): Promise<void> {
  createInitLock();
  try {
    runMigrations();
    await runGenerator();
    await seedCatalog();
    await registerSlashCommands();
    removeInitLock();
    console.log("Init finished successfully.");
  } catch (err) {
    removeInitLock();
    console.error("Init failed:", err);
    process.exit(1);
  }
}

await main();
