import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/client.js";

function normalizeUsername(s: string): string {
  return s.trim().toLowerCase();
}

export function isDiscordActivityLikeOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return u.hostname.endsWith("discordsays.com") || u.hostname === "discord.com";
  } catch {
    return false;
  }
}

function requestOrigin(req: Request): string | undefined {
  const o = req.header("origin");
  if (o) return o;
  const ref = req.header("referer");
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return undefined;
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activityId = req.header("x-discord-user-id")?.trim();
    const origin = requestOrigin(req);
    const trustHeader = process.env["TRUST_X_DISCORD_USER_ID"] === "1";

    if (activityId && (trustHeader || isDiscordActivityLikeOrigin(origin))) {
      let user = await prisma.user.findUnique({ where: { discordId: activityId } });
      if (!user) {
        user = await prisma.user.create({
          data: { discordId: activityId },
        });
      }
      req.user = user;
      next();
      return;
    }

    const sid = req.session.userId;
    if (typeof sid === "string") {
      const user = await prisma.user.findUnique({ where: { id: sid } });
      if (user) {
        req.user = user;
        next();
        return;
      }
    }

    res.status(401).json({ error: "Not signed in" });
  } catch (e) {
    next(e);
  }
}

/** Load user if present (session or Discord Activity); do not 401. */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const activityId = req.header("x-discord-user-id")?.trim();
    const origin = requestOrigin(req);
    const trustHeader = process.env["TRUST_X_DISCORD_USER_ID"] === "1";
    if (activityId && (trustHeader || isDiscordActivityLikeOrigin(origin))) {
      let user = await prisma.user.findUnique({ where: { discordId: activityId } });
      if (!user) {
        user = await prisma.user.create({ data: { discordId: activityId } });
      }
      req.user = user;
      next();
      return;
    }
    const sid = req.session.userId;
    if (typeof sid === "string") {
      const user = await prisma.user.findUnique({ where: { id: sid } });
      if (user) req.user = user;
    }
    next();
  } catch (e) {
    next(e);
  }
}

export { normalizeUsername };
