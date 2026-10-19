import { Router } from "express";
import { listReminders, parseReminderAction, setReminder } from "../../../../src/game/reminders.js";
import { authMiddleware } from "../middleware/auth.js";
import { queueReminder } from "../utils/notify-bot.js";

const TYPE_OF = { daily: "DAILY", drop: "DROP", grab: "GRAB" } as const;

export const remindersRouter = Router();

remindersRouter.use(authMiddleware);

remindersRouter.get("/", async (req, res) => {
  const rows = await listReminders(req.user!.discordId);
  res.json({ reminders: rows });
});

remindersRouter.put("/", async (req, res) => {
  const action = typeof req.body?.action === "string" ? parseReminderAction(req.body.action) : null;
  if (!action || typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ error: "Choose drop, grab, or daily, and say whether it is on." });
    return;
  }
  await setReminder(req.user!.discordId, req.user!.discordUsername, action, req.body.enabled);
  try {
    await queueReminder(req.user!.discordId, TYPE_OF[action]);
  } catch (err) {
    console.error("Akira saved the reminder but couldn't tell the bot:", err);
  }
  const rows = await listReminders(req.user!.discordId);
  res.json({ reminders: rows });
});
