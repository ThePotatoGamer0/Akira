import http from "node:http";
import type { Request, RequestHandler, Response } from "express";
import { WebSocket, WebSocketServer } from "ws";

const browsers = new Set<WebSocket>();
let bot: WebSocket | null = null;
let reconnect: ReturnType<typeof setTimeout> | null = null;

function botUrl(): string | null {
  const base = process.env["BOT_INTERNAL_URL"]?.replace(/\/$/, "");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) return null;
  return base.replace(/^http/, "ws");
}

function ensureBot(): void {
  if (bot && (bot.readyState === WebSocket.OPEN || bot.readyState === WebSocket.CONNECTING)) return;
  const base = botUrl();
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) return;
  const socket = new WebSocket(`${base}/internal/drop-live`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  bot = socket;
  socket.on("message", (data) => {
    const text = data.toString();
    for (const client of browsers) {
      if (client.readyState === WebSocket.OPEN) client.send(text);
    }
  });
  socket.on("close", () => {
    if (bot === socket) bot = null;
    if (browsers.size > 0) reconnect = setTimeout(ensureBot, 1000);
  });
  socket.on("error", () => {
    socket.close();
  });
}

function releaseBot(): void {
  if (browsers.size > 0) return;
  if (reconnect) clearTimeout(reconnect);
  reconnect = null;
  bot?.close();
  bot = null;
}

/** Browser sockets for the drop channel. The bot pushes events; this fans them out. */
export function attachChannelLive(server: http.Server, session: RequestHandler): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/channel/live") {
      socket.destroy();
      return;
    }
    const res = new http.ServerResponse(req);
    res.writeHead = (() => res) as typeof res.writeHead;
    res.setHeader = (() => res) as typeof res.setHeader;
    res.end = (() => res) as typeof res.end;
    session(req as Request, res as unknown as Response, () => {
      const userId = (req as Request).session?.userId;
      const bearer = req.headers["authorization"] ?? "";
      if (!userId || /^Bearer\s+/i.test(bearer)) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        browsers.add(ws);
        ensureBot();
        ws.on("close", () => {
          browsers.delete(ws);
          releaseBot();
        });
      });
    });
  });
}
