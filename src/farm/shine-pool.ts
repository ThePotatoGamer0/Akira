import { MessageChannel, type MessagePort, Worker } from "node:worker_threads";
import { startChild } from "./child.js";

export type ShineStripJob = {
  strip: number;
  rgba: Buffer;
  width: number;
  height: number;
  apng: boolean;
  delayMs: number;
};

/** What a card thread needs to reach the strips: ask for one, get one back. */
export type ShineThreads = {
  cut(job: ShineStripJob): Promise<ShineCut>;
  close(): Promise<void>;
};

export type ShineCut = {
  /** The strip's pages, starting with the card its block begins as. */
  image: Buffer;
  /** The APNG of the strip, or null when the card had no APNG. */
  apng: Buffer | null;
};

type Reply = { ok: true; image: Buffer; apng: Buffer | null } | { ok: false; error: string };

type Job = { job: ShineStripJob; resolve: (cut: ShineCut) => void; reject: (err: Error) => void };

type StripThread = {
  worker: Worker;
  /** The jobs this thread has, in the order it will draw them, with the one in hand first. */
  jobs: Job[];
};

/**
 * Shine strips are drawn, and their APNGs written, on a few threads of their
 * own. One thread for every card would only queue on the same cores.
 */
export class ShinePool implements ShineThreads {
  private readonly threads: StripThread[] = [];
  private readonly ports: MessagePort[] = [];

  constructor(size: number) {
    for (let index = 0; index < Math.max(1, size); index += 1) {
      const entry: StripThread = { worker: startChild("shine-worker.ts"), jobs: [] };
      entry.worker.on("message", (reply: Reply) => {
        const current = entry.jobs.shift();
        if (!current) return;
        // Buffers arrive back as plain byte arrays.
        if (reply.ok) current.resolve({ image: Buffer.from(reply.image), apng: reply.apng ? Buffer.from(reply.apng) : null });
        else current.reject(new Error(reply.error));
        void this.send(entry);
      });
      this.threads.push(entry);
    }
  }

  /** Cut one strip, behind whatever its thread is already drawing. */
  cut(job: ShineStripJob): Promise<ShineCut> {
    const entry = this.threads[job.strip % this.threads.length]!;
    return new Promise<ShineCut>((resolve, reject) => {
      entry.jobs.push({ job, resolve, reject });
      if (entry.jobs.length === 1) void this.send(entry);
    });
  }

  /**
   * A port that lets a card thread ask for strips. The requesting thread's own
   * messages are what `parentPort` already carries, so the strips answer here.
   */
  port(): MessagePort {
    const { port1, port2 } = new MessageChannel();
    this.ports.push(port1);
    port1.on("message", (request: ShineStripJob & { id: number }) => {
      void this.cut(request).then(
        (cut) => port1.postMessage({ id: request.id, ok: true, image: cut.image, apng: cut.apng }),
        (err: unknown) => port1.postMessage({ id: request.id, ok: false, error: err instanceof Error ? err.message : "shine failed" }),
      );
    });
    return port2;
  }

  workers(): Worker[] {
    return this.threads.map((entry) => entry.worker);
  }

  /** Hand the thread its next strip. The job is tagged, since the worker takes its work down the same port. */
  private async send(entry: StripThread): Promise<void> {
    const current = entry.jobs[0];
    if (!current) return;
    // A quiet moment before the strip goes, so a card message sent just now lands first.
    await new Promise((resolve) => setTimeout(resolve, 1));
    entry.worker.postMessage({ shineJob: current.job });
  }

  async close(): Promise<void> {
    for (const port of this.ports) port.close();
    await Promise.all(this.threads.map((entry) => entry.worker.terminate()));
  }
}
