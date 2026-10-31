import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

/** A worker that was started as TypeScript this way runs as TypeScript too. */
function isTsxImport(spec: string): boolean {
  return spec === "tsx" || spec === "tsx/esm" || spec.includes("/tsx/dist/");
}

/**
 * The node flags a child worker needs: whatever this process was started with,
 * plus tsx when the source is TypeScript, plus the register hook that lets a
 * worker draw cards the same way the server does.
 */
export function childExecArgv(): string[] {
  const hook = fileURLToPath(new URL("../game/card-cache-register.mjs", import.meta.url));
  const argv: string[] = [];
  let sawTsx = false;
  for (let index = 0; index < process.execArgv.length; index += 1) {
    const arg = process.execArgv[index] ?? "";
    if (arg === "--import" || arg === "--require") {
      const spec = process.execArgv[index + 1] ?? "";
      argv.push(arg, spec);
      if (arg === "--import" && isTsxImport(spec)) sawTsx = true;
      index += 1;
      continue;
    }
    if (arg.startsWith("--import=") || arg.startsWith("--require=")) {
      const spec = arg.slice(arg.indexOf("=") + 1);
      argv.push(arg);
      if (arg.startsWith("--import=") && isTsxImport(spec)) sawTsx = true;
    }
  }
  if (!sawTsx) argv.push("--import", "tsx");
  argv.push("--import", hook);
  return argv;
}

/** A worker module beside this file, preferring the TypeScript it runs from. */
export function beside(module: string): URL {
  const ts = new URL(module.endsWith(".ts") ? `./${module}` : `./${module}.ts`, import.meta.url);
  if (fs.existsSync(ts)) return ts;
  return new URL(`./${module.replace(/\.ts$/, "")}.js`, import.meta.url);
}

/**
 * Child threads draw without libvips threads of their own: one thread per card,
 * and one per stretch of shine, is the parallelism.
 */
export function startChild(module: string): Worker {
  return new Worker(beside(module), { execArgv: childExecArgv(), env: { ...process.env, UV_THREADPOOL_SIZE: "2" } });
}
