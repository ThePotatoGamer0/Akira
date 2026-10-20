import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { fetchComposerAssets, fetchDropLog, postChannelMessage } from "../utils/drop-log.js";

export const channelRouter = Router();

function bearerToken(req: { header(name: string): string | undefined }): string {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

channelRouter.get("/composer", authMiddleware, async (req, res) => {
  if (bearerToken(req)) {
    res.status(403).json({ error: "The drop channel view is on the website." });
    return;
  }
  try {
    res.json(await fetchComposerAssets());
  } catch (err) {
    console.error("composer assets:", err);
    res.json({ emojis: [], stickers: [] });
  }
});

type TenorGif = { id?: string; content_description?: string; media_formats?: Record<string, { url?: string }> };

channelRouter.get("/gifs", authMiddleware, async (req, res) => {
  if (bearerToken(req)) {
    res.status(403).json({ error: "The drop channel view is on the website." });
    return;
  }
  const key = process.env["TENOR_API_KEY"] ?? "";
  if (!key) {
    res.json({ gifs: [], unavailable: true });
    return;
  }
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim().slice(0, 80) : "";
  const url = new URL(`https://tenor.googleapis.com/v2/${q ? "search" : "featured"}`);
  url.searchParams.set("key", key);
  url.searchParams.set("limit", "24");
  url.searchParams.set("media_filter", "gif,tinygif");
  if (q) url.searchParams.set("q", q);
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.json({ gifs: [] });
      return;
    }
    const json = (await upstream.json()) as { results?: TenorGif[] };
    const gifs = (json.results ?? [])
      .map((item) => {
        const full = item.media_formats?.["gif"]?.url;
        const preview = item.media_formats?.["tinygif"]?.url ?? full;
        if (!item.id || !full || !preview) return null;
        return { id: item.id, name: item.content_description ?? "GIF", url: full, preview };
      })
      .filter((item) => item != null);
    res.json({ gifs });
  } catch (err) {
    console.error("tenor:", err);
    res.json({ gifs: [] });
  }
});

channelRouter.post("/messages", authMiddleware, async (req, res) => {
  if (bearerToken(req)) {
    res.status(403).json({ error: "The drop channel view is on the website." });
    return;
  }
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  const filesIn = Array.isArray(req.body?.files) ? req.body.files : [];
  const gifUrlsIn = Array.isArray(req.body?.gifUrls) ? req.body.gifUrls : [];
  const stickerIdsIn = Array.isArray(req.body?.stickerIds) ? req.body.stickerIds : [];
  if (content.length > 2000 || filesIn.length > 10 || gifUrlsIn.length > 10 || stickerIdsIn.length > 10) {
    res.status(400).json({ error: "That message is too long for Discord." });
    return;
  }
  const files: Array<{ name: string; data: string }> = [];
  for (const item of filesIn) {
    if (!item || typeof item !== "object") {
      res.status(400).json({ error: "Akira couldn't read that file." });
      return;
    }
    const row = item as { name?: unknown; data?: unknown };
    if (typeof row.name !== "string" || typeof row.data !== "string" || row.data.length > 12_000_000) {
      res.status(400).json({ error: "Akira can take files up to 8 MB." });
      return;
    }
    files.push({ name: row.name.slice(0, 120), data: row.data });
  }
  const gifUrls = gifUrlsIn.filter((item: unknown): item is string => typeof item === "string" && item.length < 500);
  const stickerIds = stickerIdsIn.filter((item: unknown): item is string => typeof item === "string" && /^\d{17,20}$/.test(item));
  try {
    await postChannelMessage({
      discordId: req.user!.discordId,
      content,
      files,
      gifUrls,
      stickerIds,
    });
    res.status(204).end();
  } catch (err) {
    const status = err instanceof Error && "status" in err && typeof err.status === "number" ? err.status : 502;
    const message = err instanceof Error && err.message && err.message !== "failed" && err.message !== "missing"
      ? err.message
      : err instanceof Error && err.message === "missing"
        ? "Akira isn't connected to the bot from here."
        : "Akira couldn't send that.";
    if (status >= 500) console.error("channel message:", err);
    res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

channelRouter.get("/", authMiddleware, async (req, res) => {
  if (bearerToken(req)) {
    res.status(403).json({ error: "The drop channel view is on the website." });
    return;
  }
  try {
    const before = typeof req.query["before"] === "string" ? req.query["before"] : undefined;
    const log = await fetchDropLog(before);
    res.json({ log });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "no-channel") {
      res.status(404).json({ error: "Akira doesn't have a drop channel yet." });
      return;
    }
    if (code === "missing") {
      res.status(404).json({ error: "Akira isn't connected to the bot from here." });
      return;
    }
    console.error("drop channel:", err);
    res.status(502).json({ error: "Akira couldn't read the drop channel." });
  }
});
