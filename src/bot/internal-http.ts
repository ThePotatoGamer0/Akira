import http from "node:http";
import { URL } from "node:url";
import type { Client } from "discord.js";
import { WebSocketServer } from "ws";
import type { CooldownType } from "../generated/prisma/client.js";
import { readComposerAssets } from "./composer-assets.js";
import { readDropChannelLog } from "./drop-log.js";
import { bindDropLive, subscribeDropLive } from "./drop-live.js";
import { rememberEphemeralDm } from "./dm-mailbox.js";
import { queueCooldownReminder } from "./reminder-schedule.js";
import { postWebsiteMessage, WebsitePostError } from "./website-message.js";
import { runWebsiteAction, WebsiteActionError } from "./website-action.js";

function readBody(req: http.IncomingMessage, max = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
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
        const before = url.searchParams.get("before") ?? undefined;
        const log = await readDropChannelLog(bot, before ? { before } : {});
        if (!log) {
          res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "no-channel" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(log));
        return;
      }
      if (req.method === "GET" && url.pathname === "/internal/composer") {
        const assets = await readComposerAssets(bot);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(assets));
        return;
      }
      if (req.method === "POST" && url.pathname === "/internal/channel-message") {
        const raw = await readBody(req, 35_000_000);
        let json: { discordId?: unknown; content?: unknown; files?: unknown; gifUrls?: unknown; stickerIds?: unknown };
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          res.writeHead(400).end("bad json");
          return;
        }
        if (typeof json.discordId !== "string") {
          res.writeHead(400).end("bad json");
          return;
        }
        const files = Array.isArray(json.files) ? json.files : [];
        const parsedFiles: Array<{ name: string; data: Buffer }> = [];
        for (const item of files) {
          if (!item || typeof item !== "object") {
            res.writeHead(400).end("bad json");
            return;
          }
          const row = item as { name?: unknown; data?: unknown };
          if (typeof row.name !== "string" || typeof row.data !== "string") {
            res.writeHead(400).end("bad json");
            return;
          }
          parsedFiles.push({ name: row.name, data: Buffer.from(row.data, "base64") });
        }
        const gifUrls = Array.isArray(json.gifUrls) ? json.gifUrls.filter((item): item is string => typeof item === "string") : [];
        const stickerIds = Array.isArray(json.stickerIds) ? json.stickerIds.filter((item): item is string => typeof item === "string") : [];
        try {
          await postWebsiteMessage(bot, {
            discordId: json.discordId,
            content: typeof json.content === "string" ? json.content : "",
            files: parsedFiles,
            gifUrls,
            stickerIds,
          });
        } catch (err) {
          if (err instanceof WebsitePostError) {
            res.writeHead(err.status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: err.message }));
            return;
          }
          throw err;
        }
        res.writeHead(204).end();
        return;
      }
      if (req.method === "POST" && url.pathname === "/internal/channel-action") {
        const raw = await readBody(req);
        let json: {
          discordId?: unknown;
          messageId?: unknown;
          kind?: unknown;
          emojiName?: unknown;
          customId?: unknown;
          values?: unknown;
        };
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          res.writeHead(400).end("bad json");
          return;
        }
        if (typeof json.discordId !== "string" || typeof json.messageId !== "string") {
          res.writeHead(400).end("bad json");
          return;
        }
        if (json.kind !== "reaction" && json.kind !== "button" && json.kind !== "select") {
          res.writeHead(400).end("bad json");
          return;
        }
        const values = Array.isArray(json.values) ? json.values.filter((item): item is string => typeof item === "string") : [];
        try {
          const result = await runWebsiteAction(bot, {
            discordId: json.discordId,
            messageId: json.messageId,
            kind: json.kind,
            ...(typeof json.emojiName === "string" ? { emojiName: json.emojiName } : {}),
            ...(typeof json.customId === "string" ? { customId: json.customId } : {}),
            values,
          });
          if (result.notice) {
            res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ notice: result.notice }));
            return;
          }
          res.writeHead(204).end();
        } catch (err) {
          if (err instanceof WebsiteActionError) {
            res.writeHead(err.status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: err.message }));
            return;
          }
          throw err;
        }
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

  const live = new WebSocketServer({ noServer: true });
  bindDropLive(bot);
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname !== "/internal/drop-live" || req.headers["authorization"] !== `Bearer ${secret}`) {
      socket.destroy();
      return;
    }
    live.handleUpgrade(req, socket, head, (ws) => {
      const unsubscribe = subscribeDropLive((payload) => {
        if (ws.readyState === ws.OPEN) ws.send(payload);
      });
      ws.on("close", unsubscribe);
    });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Akira internal API listening on ${port} (dm-verify, queue-reminder, drop-log, channel-message, channel-action)`);
  });
}
