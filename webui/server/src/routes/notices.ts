import { Router } from "express";
import { listNotices, markNoticeRead, markNoticesRead } from "../../../../src/game/notices.js";
import { authMiddleware } from "../middleware/auth.js";

export const noticesRouter = Router();

noticesRouter.use(authMiddleware);

noticesRouter.get("/", async (req, res) => {
  const notices = await listNotices(req.user!.id);
  res.json({ notices });
});

noticesRouter.post("/read", async (req, res) => {
  await markNoticesRead(req.user!.id);
  res.json({ notices: await listNotices(req.user!.id) });
});

noticesRouter.post("/:id/read", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Akira needs a notice to clear." });
    return;
  }
  const found = await markNoticeRead(req.user!.id, id);
  if (!found) {
    res.status(404).json({ error: "Akira couldn't find that notice." });
    return;
  }
  res.json({ notices: await listNotices(req.user!.id) });
});
