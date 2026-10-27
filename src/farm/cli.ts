import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { FarmRedrawJob } from "../game/card-cache.js";
import type { FarmStatus } from "../game/card-farm.js";
import { frameFromConfig, type FrameAsset } from "../utils/frames.js";
import { parseFarmArgs } from "./args.js";
import type { FarmWorkerJob, FarmWorkerResult } from "./worker.js";

function isTsxImport(spec: string): boolean {
  return spec === "tsx" || spec === "tsx/esm" || spec.includes("/tsx/dist/");
}

function workerUrl(): URL {
  const ts = new URL("./worker.ts", import.meta.url);
  if (fs.existsSync(ts)) return ts;
  return new URL("./worker.js", import.meta.url);
}

function workerExecArgv(): string[] {
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

function workerCount(): number {
  const cpus = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(16, cpus));
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function farmFetch(url: string, token: string, pathName: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${url}${pathName}`, {
    ...init,
    headers: { ...auth(token), ...init?.headers },
  });
  return response;
}

async function download(url: string, token: string, pathName: string, dest: string): Promise<void> {
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const response = await farmFetch(url, token, pathName);
  if (!response.ok) {
    throw new Error(`Akira could not send ${pathName} (${response.status}).`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const temporary = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, data);
  fs.renameSync(temporary, dest);
}

async function portraitPath(
  url: string,
  token: string,
  root: string,
  job: FarmRedrawJob,
): Promise<string> {
  const dest = path.join(root, "art", job.variant.seriesSlug, job.variant.characterSlug, job.variant.image);
  await download(
    url,
    token,
    `/farm/art/${encodeURIComponent(job.variant.seriesSlug)}/${encodeURIComponent(job.variant.characterSlug)}/${encodeURIComponent(job.variant.image)}`,
    dest,
  );
  return dest;
}

async function frameAsset(
  url: string,
  token: string,
  root: string,
  frameId: number,
): Promise<FrameAsset> {
  const dir = path.join(root, "frames", String(frameId));
  const imagePath = path.join(dir, "frame.png");
  const configPath = path.join(dir, "config.json");
  await download(url, token, `/farm/frame/${frameId}/frame.png`, imagePath);
  try {
    await download(url, token, `/farm/frame/${frameId}/config.json`, configPath);
  } catch {
    // Some frames only have the picture.
  }
  const configRaw = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : null;
  return frameFromConfig(frameId, imagePath, configRaw);
}

function askWorker(worker: Worker, job: FarmWorkerJob): Promise<FarmWorkerResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: FarmWorkerResult) => {
      if (message.id !== job.id) return;
      cleanup();
      resolve(message);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.postMessage(job);
  });
}

async function upload(url: string, token: string, jobId: number, fileName: string, data: Buffer): Promise<void> {
  const response = await farmFetch(url, token, `/farm/file/${jobId}/${encodeURIComponent(fileName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(data),
  });
  if (!response.ok) {
    throw new Error(`Akira did not take ${fileName} for job ${jobId} (${response.status}).`);
  }
}

async function finish(url: string, token: string, jobId: number, redrawn: number, skipped: number): Promise<FarmStatus> {
  const response = await farmFetch(url, token, `/farm/finish/${jobId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redrawn, skipped }),
  });
  if (!response.ok) {
    throw new Error(`Akira could not close job ${jobId} (${response.status}).`);
  }
  return (await response.json()) as FarmStatus;
}

async function main(): Promise<void> {
  const args = parseFarmArgs(process.argv.slice(2));
  if (!args.url || !args.token) {
    console.error("Usage: npm run farm -- http://192.168.0.10:3333 CODE");
    process.exitCode = 1;
    return;
  }

  const hello = await farmFetch(args.url, args.token, "/farm/hello");
  if (hello.status === 401) {
    console.error("Akira is not waiting for that token. Run `afarm` on the Pi first.");
    process.exitCode = 1;
    return;
  }
  if (!hello.ok) {
    console.error(`Akira did not answer the farm (${hello.status}).`);
    process.exitCode = 1;
    return;
  }
  const start = (await hello.json()) as FarmStatus;
  console.log(`Akira sent ${start.totalFiles.toLocaleString("en-US")} cached pictures. Drawing them here.`);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "akira-farm-"));
  const workers: Worker[] = [];
  const count = workerCount();
  try {
    for (let index = 0; index < count; index += 1) {
      workers.push(new Worker(workerUrl(), {
        execArgv: workerExecArgv(),
        env: { ...process.env, UV_THREADPOOL_SIZE: "2" },
      }));
    }

    let cursor = 0;
    const take = (queue: FarmWorkerJob[]) => (cursor < queue.length ? queue[cursor++] : undefined);

    for (;;) {
      const claimed = await farmFetch(args.url, args.token, "/farm/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (!claimed.ok) {
        throw new Error(`Akira closed the farm (${claimed.status}).`);
      }
      const body = (await claimed.json()) as { jobs: FarmRedrawJob[] };
      if (body.jobs.length === 0) break;

      const prepared: FarmWorkerJob[] = [];
      for (const job of body.jobs) {
        prepared.push({
          ...job,
          artPath: await portraitPath(args.url, args.token, scratch, job),
          frame: await frameAsset(args.url, args.token, scratch, job.group.frameId),
        });
      }

      cursor = 0;
      await Promise.all(workers.map(async (worker) => {
        for (;;) {
          const job = take(prepared);
          if (!job) break;
          try {
            const result = await askWorker(worker, job);
            if (!result.ok) {
              console.error(`Card ${job.group.variantId} failed: ${result.error ?? "unknown"}`);
              const view = await finish(args.url, args.token, job.id, 0, job.group.files.length);
              console.log(`${view.doneFiles.toLocaleString("en-US")} / ${view.totalFiles.toLocaleString("en-US")}`);
              continue;
            }
            for (const file of result.files) {
              await upload(args.url, args.token, job.id, file.fileName, file.data);
            }
            const view = await finish(args.url, args.token, job.id, job.group.files.length, 0);
            console.log(`${view.doneFiles.toLocaleString("en-US")} / ${view.totalFiles.toLocaleString("en-US")}`);
          } catch (err) {
            console.error(`Card ${job.group.variantId} failed.`, err);
            await finish(args.url, args.token, job.id, 0, job.group.files.length).catch(() => undefined);
          }
        }
      }));
    }
    console.log("Akira has the pictures. You can leave this.");
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
