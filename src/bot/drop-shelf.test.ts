import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { workerExecArgv, workerUrl } from "./drop-shelf.js";

test("the drop shelf worker can import the game sources", async () => {
  const argv = workerExecArgv();
  assert.ok(argv.includes("tsx") || argv.some((arg) => arg.includes("/tsx/dist/")));
  assert.ok(argv.some((arg) => arg.endsWith("drop-shelf-register.mjs")));
  const worker = new Worker(workerUrl(), { execArgv: argv });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1_000);
      worker.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  } finally {
    await worker.terminate();
  }
});
