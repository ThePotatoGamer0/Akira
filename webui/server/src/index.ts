import "dotenv/config";
import path from "node:path";
import cors from "cors";
import express from "express";
import session from "express-session";
import { authRouter } from "./routes/auth.js";
import { collectionRouter } from "./routes/collection.js";
import { economyRouter } from "./routes/economy.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { adminRouter } from "./routes/admin.js";
import { REPO_ROOT } from "./utils/repo-root.js";

const app = express();
const port = Number(process.env["WEBUI_SERVER_PORT"] ?? "3333");

const defaultOrigins = [
  "https://discord.com",
  "https://discordsays.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const extra = (process.env["WEBUI_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) {
        cb(null, true);
        return;
      }
      try {
        const host = new URL(origin).hostname;
        if (
          defaultOrigins.includes(origin) ||
          extra.includes(origin) ||
          host.endsWith("discordsays.com") ||
          host === "localhost"
        ) {
          cb(null, true);
          return;
        }
      } catch {
        /* ignore */
      }
      cb(null, false);
    },
    credentials: true,
  }),
);

app.use((_req, res, next) => {
  const fa =
    process.env["WEBUI_FRAME_ANCESTORS"] ??
    "'self' https://discord.com https://discordsays.com";
  res.setHeader("Content-Security-Policy", `frame-ancestors ${fa}`);
  next();
});

app.use(express.json());

app.use(
  session({
    name: "akira.sid",
    secret: process.env["SESSION_SECRET"] ?? "dev-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: process.env["NODE_ENV"] === "production" ? "lax" : "lax",
      secure: process.env["COOKIE_SECURE"] === "1",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }),
);

const cardsStatic = path.join(REPO_ROOT, "assets", "cards");
app.use("/api/static/cards", express.static(cardsStatic));

app.use("/auth", authRouter);
app.use("/collection", collectionRouter);
app.use("/economy", economyRouter);
app.use("/leaderboard", leaderboardRouter);
app.use("/admin", adminRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Return JSON (not Express HTML) so the browser client can always parse errors
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  if (!res.headersSent) {
    res.status(500).json({ error: message });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Akira WebUI API on http://0.0.0.0:${port}`);
});
