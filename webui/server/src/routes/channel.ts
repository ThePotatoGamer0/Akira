import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { fetchDropLog } from "../utils/drop-log.js";

export const channelRouter = Router();

function bearerToken(req: { header(name: string): string | undefined }): string {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

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
