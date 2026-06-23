import type { NextFunction, Request, Response } from "express";

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Akira says that's for admins only." });
    return;
  }
  next();
}
