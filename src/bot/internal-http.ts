import http from "node:http";
import { URL } from "node:url";
import type { Client } from "discord.js";

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
 * POST /internal/dm-verify  { "discordId": string, "code": string }
 */
export function startInternalApi(bot: Client): void {
  const port = Number(process.env["AKIRA_INTERNAL_PORT"] ?? "0");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!port || !secret) {
    return;
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.writeHead(404).end();
        return;
      }
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/internal/dm-verify") {
        res.writeHead(404).end();
        return;
      }
      const auth = req.headers["authorization"];
      if (auth !== `Bearer ${secret}`) {
        res.writeHead(401).end("unauthorized");
        return;
      }
      const raw = await readBody(req);
      const json = JSON.parse(raw) as { discordId?: string; code?: string };
      if (!json.discordId || !json.code) {
        res.writeHead(400).end("bad json");
        return;
      }
      const user = await bot.users.fetch(json.discordId);
      await user.send(
        `Hey — it's Akira. Your WebUI sign-in code is **${json.code}**. It expires in a few minutes. Don't share it with anyone!`,
      );
      res.writeHead(204).end();
    } catch (e) {
      console.error("internal-api:", e);
      res.writeHead(500).end("error");
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Akira internal API listening on ${port} (dm-verify)`);
  });
}
