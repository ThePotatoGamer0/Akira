import type { NextFunction, Request, Response } from "express";
import { userIsAdmin } from "../host.js";

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !userIsAdmin(req.user)) {
    res.status(403).json({ error: "Akira says that's for admins only." });
    return;
  }
  next();
}
