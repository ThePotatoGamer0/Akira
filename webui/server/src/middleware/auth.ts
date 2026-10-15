import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/client.js";
import { userForActivityToken } from "../utils/discord-activity.js";

function normalizeUsername(s: string): string {
  return s.trim().toLowerCase();
}

function bearerToken(req: Request): string {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

async function userFromRequest(req: Request) {
  const token = bearerToken(req);
  if (token) return userForActivityToken(token);
  const sid = req.session.userId;
  if (typeof sid !== "string") return null;
  return prisma.user.findUnique({ where: { id: sid } });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearerToken(req);
    const user = await userFromRequest(req);
    if (user) {
      req.user = user;
      next();
      return;
    }
    if (token) {
      res.status(401).json({
        error: "Akira couldn't find a player with that Discord username yet. Use the bot once, then open this again.",
      });
      return;
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
    const user = await userFromRequest(req);
    if (user) req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export { normalizeUsername };
