import http from "node:http";
import { URL } from "node:url";
import type { Client } from "discord.js";
import type { CooldownType } from "../generated/prisma/client.js";
import { readDropChannelLog } from "./drop-log.js";
import { rememberEphemeralDm } from "./dm-mailbox.js";
import { queueCooldownReminder } from "./reminder-schedule.js";

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Minimal internal HTTP API for WebUI verification DMs. Protected by AKIRA_INTERNAL_SECRET.
 * POST /internal/dm-verify  { "discordId": string, "code": string, "expiresAt"?: number }
 */
export function startInternalApi(bot: Client): void {
  const port = Number(process.env["AKIRA_INTERNAL_PORT"] ?? "0");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!port || !secret) {
    return;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      const auth = req.headers["authorization"];
      if (auth !== `Bearer ${secret}`) {
        res.writeHead(401).end("unauthorized");
        return;
      }
      if (req.method === "GET" && url.pathname === "/internal/drop-log") {
        const log = await readDropChannelLog(bot);
        if (!log) {
          res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "no-channel" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(log));
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(404).end();
        return;
      }
      const raw = await readBody(req);
      if (url.pathname === "/internal/queue-reminder") {
        const json = JSON.parse(raw) as { discordId?: string; type?: string };
        const type = json.type;
        if (!json.discordId || (type !== "DAILY" && type !== "DROP" && type !== "GRAB")) {
          res.writeHead(400).end("bad json");
          return;
        }
        await queueCooldownReminder(json.discordId, type as CooldownType);
        res.writeHead(204).end();
        return;
      }
      if (url.pathname !== "/internal/dm-verify") {
        res.writeHead(404).end();
        return;
      }
      const json = JSON.parse(raw) as { discordId?: string; code?: string; expiresAt?: number };
      if (!json.discordId || !json.code) {
        res.writeHead(400).end("bad json");
        return;
      }
      const expiresAt = typeof json.expiresAt === "number" ? json.expiresAt : Date.now() + 10 * 60 * 1000;
      const user = await bot.users.fetch(json.discordId);
      const sent = await user.send(
        `Hey - it's Akira. Your WebUI sign-in code is **${json.code}**. It expires in a few minutes. Don't share it with anyone!`,
      );
      await rememberEphemeralDm(sent, new Date(expiresAt));
      res.writeHead(204).end();
    } catch (e) {
      console.error("internal-api:", e);
      res.writeHead(500).end("error");
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Akira internal API listening on ${port} (dm-verify, queue-reminder, drop-log)`);
  });
}
