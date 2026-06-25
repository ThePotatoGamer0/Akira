import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client.js";
import { authMiddleware, normalizeUsername } from "../middleware/auth.js";
import { createVerificationCode, consumeVerificationCode } from "../utils/verificationCodes.js";
import { sendVerificationDm } from "../utils/notify-bot.js";
import { akiraAddressName } from "../utils/akira-address-name.js";

export const authRouter = Router();

const PREFERRED_NAME_MAX = 64;

function serializeMe(u: {
  id: string;
  discordId: string;
  discordUsername: string | null;
  preferredName: string | null;
  bits: number;
  prestigeLevel: number;
  milestoneCount: number;
  milestoneProgress: number;
  passiveBitsBonus: number;
  isAdmin: boolean;
}) {
  return {
    id: u.id,
    discordId: u.discordId,
    discordUsername: u.discordUsername,
    preferredName: u.preferredName,
    displayName: akiraAddressName(u),
    bits: u.bits,
    prestigeLevel: u.prestigeLevel,
    milestoneCount: u.milestoneCount,
    milestoneProgress: u.milestoneProgress,
    passiveBitsBonus: u.passiveBitsBonus,
    isAdmin: u.isAdmin,
  };
}

function activityForbidden(res: Response): void {
  res.status(400).json({
    error: "That step is for the browser WebUI - you're already signed in with Discord here.",
  });
}

authRouter.post("/init", async (req, res) => {
  if (req.header("x-discord-user-id")) {
    activityForbidden(res);
    return;
  }
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const norm = normalizeUsername(username);
  if (!norm) {
    res.status(400).json({ error: "Akira needs a Discord username to look you up." });
    return;
  }
  const user = await prisma.user.findFirst({
    where: { discordUsername: norm },
  });
  if (!user) {
    res.status(404).json({
      error:
        "Akira couldn't find a player with that Discord username yet. Make sure you've chatted with the bot and that your web username is linked to your account.",
    });
    return;
  }
  const code = createVerificationCode(user.id);
  try {
    await sendVerificationDm(user.discordId, code);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Akira couldn't reach the bot to send your DM. Try again soon." });
    return;
  }
  res.json({ status: "pending", message: "Akira slid into your DMs with a code - check Discord." });
});

authRouter.post("/verify", async (req, res) => {
  if (req.header("x-discord-user-id")) {
    activityForbidden(res);
    return;
  }
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!code) {
    res.status(400).json({ error: "Akira needs that one-time code." });
    return;
  }
  const userId = consumeVerificationCode(code);
  if (!userId) {
    res
      .status(400)
      .json({ error: "That code is wrong or expired. Start again from the login screen." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(400).json({ error: "Something got mixed up - try the flow again." });
    return;
  }
  if (!user.passwordHash) {
    req.session.pendingUserId = user.id;
    res.json({ needsPassword: true });
    return;
  }
  req.session.userId = user.id;
  req.session.pendingUserId = undefined;
  res.json({ ok: true });
});

authRouter.post("/password", async (req, res) => {
  if (req.header("x-discord-user-id")) {
    activityForbidden(res);
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const oldPassword = typeof req.body?.oldPassword === "string" ? req.body.oldPassword : "";

  if (req.session.userId && !req.session.pendingUserId) {
    if (password.length < 8) {
      res.status(400).json({ error: "New password should be at least 8 characters." });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user?.passwordHash) {
      res.status(400).json({ error: "Set a password through verification first." });
      return;
    }
    const oldOk = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!oldOk) {
      res.status(401).json({ error: "Current password doesn't match." });
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    res.json({ ok: true });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Pick a password with at least 8 characters - Akira worries about short ones." });
    return;
  }
  const pending = req.session.pendingUserId;
  if (!pending) {
    res.status(400).json({ error: "Verify your code first, then Akira can save a password for you." });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: pending },
    data: { passwordHash: hash },
  });
  req.session.userId = pending;
  req.session.pendingUserId = undefined;
  res.json({ ok: true });
});

authRouter.post("/login", async (req, res) => {
  if (req.header("x-discord-user-id")) {
    activityForbidden(res);
    return;
  }
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const norm = normalizeUsername(username);
  if (!norm || !password) {
    res.status(400).json({ error: "Akira needs both your Discord username and site password." });
    return;
  }
  const user = await prisma.user.findFirst({ where: { discordUsername: norm } });
  if (!user?.passwordHash) {
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }
  req.session.userId = user.id;
  res.json({ ok: true });
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  const u = req.user!;
  res.json(serializeMe(u));
});

authRouter.patch("/me", authMiddleware, async (req, res) => {
  const raw =
    typeof req.body?.preferredName === "string" ? req.body.preferredName.trim() : undefined;
  if (raw === undefined) {
    res.status(400).json({ error: "Send preferredName as a string (empty string clears it)." });
    return;
  }
  if (raw.length > PREFERRED_NAME_MAX) {
    res.status(400).json({ error: `Keep your name to ${PREFERRED_NAME_MAX} characters or fewer.` });
    return;
  }
  const preferredName = raw.length === 0 ? null : raw.replace(/[\r\n\u0000]/g, "");
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: { preferredName },
  });
  res.json(serializeMe(updated));
});
