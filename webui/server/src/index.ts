import "dotenv/config";
import path from "node:path";
import cors from "cors";
import express from "express";
import session from "express-session";
import { authRouter } from "./routes/auth.js";
import { collectionRouter } from "./routes/collection.js";
import { economyRouter } from "./routes/economy.js";
import { statsRouter } from "./routes/stats.js";
import { adminRouter } from "./routes/admin.js";
import { noticesRouter } from "./routes/notices.js";
import { remindersRouter } from "./routes/reminders.js";
import { channelRouter } from "./routes/channel.js";
import { attachChannelLive } from "./live/channel-socket.js";
import { serveCatalogPortrait, serveMissingCardAsset, serveSeriesCover } from "./routes/card-assets.js";
import { lookupRouter } from "./routes/lookup.js";
import { allowsCrossSite, originAllowed, parseOriginList } from "./utils/origins.js";
import { REPO_ROOT } from "./utils/repo-root.js";
import { createSqliteSessionStore } from "./session-store.js";

const app = express();
const port = Number(process.env["WEBUI_SERVER_PORT"] ?? "3333");

const defaultOrigins = [
  "https://discord.com",
  "https://discordsays.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const extra = parseOriginList(process.env["WEBUI_ORIGINS"] ?? "");
const crossSite = allowsCrossSite(extra);

app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) {
        cb(null, true);
        return;
      }
      try {
        if (originAllowed(origin, extra, defaultOrigins)) {
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

app.use("/channel/messages", express.json({ limit: "35mb" }));
app.use(express.json());

const sessionMiddleware = session({
  name: "akira.sid",
  secret: process.env["SESSION_SECRET"] ?? "dev-change-me",
  store: createSqliteSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite || process.env["COOKIE_SECURE"] === "1",
    partitioned: crossSite,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});
app.use(sessionMiddleware);

const cardsStatic = path.join(REPO_ROOT, "assets", "cards");
app.use(
  "/api/static/cards",
  express.static(cardsStatic, {
    fallthrough: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".apng")) res.setHeader("Content-Type", "image/png");
    },
  }),
);
app.get("/api/static/cards/:variantId/:frameId/:printKey/:dyeKey/:fileName", (req, res, next) => {
  void serveMissingCardAsset(req, res).catch(next);
});
app.get("/api/static/portraits/:seriesSlug/:characterSlug/:fileName", (req, res) => {
  serveCatalogPortrait(req, res);
});
app.get("/api/static/covers/:seriesSlug", (req, res) => {
  serveSeriesCover(req, res);
});

app.use("/auth", authRouter);
app.use("/collection", collectionRouter);
app.use("/economy", economyRouter);
app.use("/stats", statsRouter);
app.use("/lookup", lookupRouter);
app.use("/admin", adminRouter);
app.use("/notices", noticesRouter);
app.use("/reminders", remindersRouter);
app.use("/channel", channelRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Return JSON (not Express HTML) so the browser client can always parse errors
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  if (!res.headersSent) {
    res.status(500).json({ error: message });
  }
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Akira WebUI API on http://0.0.0.0:${port}`);
});
attachChannelLive(server, sessionMiddleware);