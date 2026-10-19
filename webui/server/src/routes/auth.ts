import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client.js";
import { authMiddleware, normalizeUsername } from "../middleware/auth.js";
import {
  exchangeActivityCode,
  profileForActivityToken,
  userForDiscordAccount,
} from "../utils/discord-activity.js";
import { createVerificationCode, consumeVerificationCode } from "../utils/verificationCodes.js";
import { sendVerificationDm } from "../utils/notify-bot.js";
import { userIsAdmin } from "../host.js";
import { akiraAddressName, sanitizePreferredName } from "../utils/akira-address-name.js";

const COLLECTION_ORDERS = new Set(["character", "series", "quality", "tag", "recent"]);

export const authRouter = Router();

function serializeMe(u: {
  id: string;
  discordId: string;
  discordUsername: string | null;
  preferredName: string | null;
  collectionOrder: string;
  continuousScroll: boolean;
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
    preferredName: u.preferredName ? sanitizePreferredName(u.preferredName) : null,
    collectionOrder: COLLECTION_ORDERS.has(u.collectionOrder) ? u.collectionOrder : "character",
    continuousScroll: u.continuousScroll === true,
    displayName: akiraAddressName(u),
    bits: u.bits,
    prestigeLevel: u.prestigeLevel,
    milestoneCount: u.milestoneCount,
    milestoneProgress: u.milestoneProgress,
    passiveBitsBonus: u.passiveBitsBonus,
    isAdmin: userIsAdmin(u),
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
  const issued = createVerificationCode(user.id);
  try {
    await sendVerificationDm(user.discordId, issued.code, issued.expiresAt);
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

authRouter.post("/activity", async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!code) {
    res.status(400).json({ error: "Discord did not send a sign-in code." });
    return;
  }
  if (!process.env["DISCORD_CLIENT_ID"] || !process.env["DISCORD_CLIENT_SECRET"]) {
    res.status(500).json({
      error: "Akira needs the Discord application secret before the activity can sign you in.",
    });
    return;
  }
  try {
    const accessToken = await exchangeActivityCode(code);
    if (!accessToken) {
      res.status(401).json({ error: "Discord didn't accept that sign-in. Open the activity again." });
      return;
    }
    const profile = await profileForActivityToken(accessToken);
    if (!profile) {
      res.status(401).json({ error: "Discord didn't accept that sign-in. Open the activity again." });
      return;
    }
    const user = await userForDiscordAccount(profile);
    if (!user) {
      res.status(404).json({
        error: `Akira couldn't find a player named ${profile.username}. Use the bot once, then open this again.`,
      });
      return;
    }
    res.json({ accessToken });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Akira couldn't finish signing you in with Discord." });
  }
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  const u = req.user!;
  res.json(serializeMe(u));
});

authRouter.patch("/me", authMiddleware, async (req, res) => {
  const body = req.body ?? {};
  const data: { preferredName?: string | null; collectionOrder?: string; continuousScroll?: boolean } = {};
  if ("preferredName" in body) {
    if (typeof body.preferredName !== "string") {
      res.status(400).json({ error: "Send preferredName as a string (empty string clears it)." });
      return;
    }
    const raw = body.preferredName.trim();
    data.preferredName = raw.length === 0 ? null : sanitizePreferredName(raw);
  }
  if ("collectionOrder" in body) {
    if (typeof body.collectionOrder !== "string" || !COLLECTION_ORDERS.has(body.collectionOrder)) {
      res.status(400).json({ error: "Akira doesn't know that collection order." });
      return;
    }
    data.collectionOrder = body.collectionOrder;
  }
  if ("continuousScroll" in body) {
    if (typeof body.continuousScroll !== "boolean") {
      res.status(400).json({ error: "Continuous scrolling needs to be on or off." });
      return;
    }
    data.continuousScroll = body.continuousScroll;
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Akira needs something to save." });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data,
  });
  res.json(serializeMe(updated));
});
