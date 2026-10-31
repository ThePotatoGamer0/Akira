import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { FarmRedrawJob } from "../game/card-cache.js";
import type { FarmStatus } from "../game/card-farm.js";
import { frameFromConfig, type FrameAsset } from "../utils/frames.js";
import { parseFarmArgs } from "./args.js";
import { startChild } from "./child.js";
import { ShinePool } from "./shine-pool.js";
import type { FarmWorkerJob, FarmWorkerResult } from "./worker.js";

/**
 * One worker per logical core. Encoding a card is CPU-bound, so a bigger machine
 * should draw more cards at once; only a deliberately small farm needs fewer.
 */
function workerCount(): number {
  const cpus = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  const wanted = Number.parseInt(process.env.AKIRA_FARM_WORKERS ?? "", 10);
  const count = Number.isFinite(wanted) && wanted > 0 ? wanted : cpus;
  return Math.max(1, count);
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

/**
 * One worker, drawing one job at a time. The farm hands over the next job as
 * soon as this one is answered, so a worker only waits for jobs that are not
 * downloaded yet, and the threads that are free start downloading them.
 */
class Drawing {
  private readonly waiting = new Map<number, (result: FarmWorkerResult) => void>();
  private readonly failed: Array<(err: Error) => void> = [];
  busy = false;

  constructor(readonly worker: Worker) {
    worker.on("message", (message: FarmWorkerResult) => {
      const settle = this.waiting.get(message.id);
      this.waiting.delete(message.id);
      settle?.(message);
    });
    worker.on("error", (err: Error) => {
      for (const reject of this.failed.splice(0)) reject(err);
    });
  }

  draw(job: FarmWorkerJob): Promise<FarmWorkerResult> {
    return new Promise((resolve, reject) => {
      this.waiting.set(job.id, resolve);
      this.failed.push(reject);
      this.worker.postMessage(job);
    });
  }
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
  // A quarter of the cores draw shine strips, the rest draw whole cards.
  const shines = new ShinePool(Math.max(1, Math.floor(count / 4)));
  try {
    for (let index = 0; index < count; index += 1) {
      const worker = startChild("render-worker.ts");
      const port = shines.port();
      worker.postMessage({ shinePort: port }, [port]);
      workers.push(worker);
    }

    const running = workers.map((worker) => new Drawing(worker));
    const ready: FarmWorkerJob[] = [];
    let drawing = 0;
    let claiming = true;

    const report = (view: FarmStatus) => {
      doneFiles = view.doneFiles;
    };
    let doneFiles = 0;

    /** Download a job's portrait and frame, sharing whatever other threads already fetched. */
    const prepare = async (job: FarmRedrawJob): Promise<FarmWorkerJob> => {
      const [art, frame] = await Promise.all([
        portraitPath(args.url, args.token, scratch, job),
        frameAsset(args.url, args.token, scratch, job.group.frameId),
      ]);
      return { ...job, artPath: art, frame };
    };

    const claim = async () => {
      claiming = true;
      const response = await farmFetch(args.url, args.token, "/farm/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (!response.ok) throw new Error(`Akira closed the farm (${response.status}).`);
      const body = (await response.json()) as { jobs: FarmRedrawJob[] };
      if (body.jobs.length === 0) claiming = false;
      for (const job of body.jobs) {
        void prepare(job).then(
          (prepared) => {
            ready.push(prepared);
            dispatch();
          },
          (err: unknown) => {
            console.error(`Card ${job.group.variantId} could not be fetched.`, err);
            void finish(args.url, args.token, job.id, 0, job.group.files.length).catch(() => undefined);
          },
        );
      }
    };

    /** Finish a card off the drawing thread: upload its pictures, then close the job. */
    const deliver = async (job: FarmWorkerJob, result: FarmWorkerResult) => {
      if (!result.ok) {
        console.error(`Card ${job.group.variantId} failed: ${result.error ?? "unknown"}`);
        report(await finish(args.url, args.token, job.id, 0, job.group.files.length));
        return;
      }
      for (const file of result.files) {
        await upload(args.url, args.token, job.id, file.fileName, file.data);
      }
      report(await finish(args.url, args.token, job.id, job.group.files.length, 0));
      drawn += 1;
      if (drawn % 10 === 0) {
        const rate = drawn / ((performance.now() - startedAt) / 60000);
        console.log(`${doneFiles.toLocaleString("en-US")} / ${start.totalFiles.toLocaleString("en-US")}  ${rate.toFixed(0)} cards a minute`);
      }
    };
    let drawn = 0;
    const startedAt = performance.now();
    let idleTicks = 0;

    const feed = (drawingJob: Drawing) => {
      const job = ready.pop();
      if (!job) return;
      drawing += 1;
      void drawingJob.draw(job).then(
        (result) => deliver(job, result).catch((err: unknown) => {
          console.error(`Card ${job.group.variantId} failed.`, err);
          return finish(args.url, args.token, job.id, 0, job.group.files.length).catch(() => undefined);
        }).finally(() => {
          drawing -= 1;
          drawingJob.busy = false;
          dispatch();
        }),
        (err: unknown) => {
          console.error(`Card ${job.group.variantId} failed.`, err);
          drawing -= 1;
          drawingJob.busy = false;
          dispatch();
        },
      );
    };

    /** Hand every free thread a job, claiming more when the queue has run dry. */
    function dispatch() {
      if (claiming && ready.length === 0) void claim().catch((err: unknown) => {
        console.error("Akira did not send more cards.", err);
      });
      for (const drawingJob of running) {
        if (drawingJob.busy || ready.length === 0) continue;
        drawingJob.busy = true;
        feed(drawingJob);
      }
    }

    dispatch();
    const clock = setInterval(() => {
      console.log(`${doneFiles.toLocaleString("en-US")} / ${start.totalFiles.toLocaleString("en-US")}  ${drawn} cards drawn`);
    }, 30000);
    // A run is over when nothing is claimed, drawn or waiting to be drawn.
    try {
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const idle = drawing === 0 && ready.length === 0;
        idleTicks = idle && !claiming ? idleTicks + 1 : 0;
        if (idleTicks > 25) break;
      }
    } finally {
      clearInterval(clock);
      console.log(`${doneFiles.toLocaleString("en-US")} / ${start.totalFiles.toLocaleString("en-US")}`);
    }
    console.log("Akira has the pictures. You can leave this.");
  } finally {
    await shines.close();
    await Promise.all(workers.map((worker) => worker.terminate()));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
