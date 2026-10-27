import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import express from "express";
import { collectRedrawJobs, isCardCacheFileName } from "../../../../src/game/card-cache.js";
import {
  cancelFarmSession,
  claimFarmJobs,
  farmHasSession,
  farmStatus,
  farmTokenOk,
  finishFarmJob,
  newFarmToken,
  peekFarmJob,
  startFarmSession,
} from "../../../../src/game/card-farm.js";
import { writeCardCacheFile } from "../../../../src/game/compose.js";
import { cachedGroupFile } from "../../../../src/game/card-redraw.js";
import { DIR_INPUT_FRAMES, variantArtPath } from "../../../../src/utils/paths.js";

const SAFE = /^[a-zA-Z0-9_-]+$/;
const SAFE_FILE = /^[a-zA-Z0-9._-]+\.(png|jpe?g|webp|gif)$/i;

function bearer(req: { headers: { authorization?: string } }): string {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

export const farmInternalRouter = Router();
export const farmRouter = Router();

farmInternalRouter.post("/start", async (_req, res) => {
  if (farmHasSession()) {
    res.status(409).json({ error: "Akira is already waiting for a PC." });
    return;
  }
  const collected = await collectRedrawJobs();
  const token = newFarmToken();
  const view = startFarmSession(collected.jobs, collected.skipped, collected.totalFiles, token);
  res.json({
    token,
    totalFiles: view.totalFiles,
    skipped: collected.skipped,
    jobs: collected.jobs.length,
  });
});

farmInternalRouter.get("/status", (_req, res) => {
  const view = farmStatus();
  if (!view) {
    res.status(404).json({ error: "Akira is not farming right now." });
    return;
  }
  res.json(view);
});

farmInternalRouter.post("/cancel", (_req, res) => {
  const view = cancelFarmSession();
  if (!view) {
    res.status(404).json({ error: "Akira is not farming right now." });
    return;
  }
  res.json(view);
});

farmRouter.use((req, res, next) => {
  if (farmTokenOk(bearer(req))) {
    next();
    return;
  }
  res.status(401).json({ error: "Akira is not waiting for that token." });
});

farmRouter.get("/hello", (_req, res) => {
  res.json(farmStatus());
});

farmRouter.post("/claim", express.json(), (req, res) => {
  const count = typeof req.body?.count === "number" ? req.body.count : 8;
  const jobs = claimFarmJobs(bearer(req), count);
  if (!jobs) {
    res.status(401).json({ error: "Akira is not waiting for that token." });
    return;
  }
  res.json({ jobs });
});

farmRouter.get("/art/:seriesSlug/:characterSlug/:fileName", (req, res) => {
  const seriesSlug = req.params["seriesSlug"] ?? "";
  const characterSlug = req.params["characterSlug"] ?? "";
  const fileName = req.params["fileName"] ?? "";
  if (!SAFE.test(seriesSlug) || !SAFE.test(characterSlug) || !SAFE_FILE.test(fileName)) {
    res.status(404).end();
    return;
  }
  const artPath = variantArtPath(seriesSlug, characterSlug, fileName);
  if (!fs.existsSync(artPath)) {
    res.status(404).end();
    return;
  }
  res.sendFile(artPath);
});

farmRouter.get("/frame/:frameId/:fileName", (req, res) => {
  const frameId = Number(req.params["frameId"]);
  const fileName = req.params["fileName"] ?? "";
  if (!Number.isInteger(frameId) || frameId < 0 || (fileName !== "frame.png" && fileName !== "config.json")) {
    res.status(404).end();
    return;
  }
  const filePath = path.join(DIR_INPUT_FRAMES, String(frameId), fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  res.sendFile(filePath);
});

farmRouter.put("/file/:jobId/:fileName", express.raw({ type: "*/*", limit: "30mb" }), (req, res) => {
  const jobId = Number(req.params["jobId"]);
  const fileName = req.params["fileName"] ?? "";
  if (!Number.isInteger(jobId) || jobId < 0 || !isCardCacheFileName(fileName)) {
    res.status(400).json({ error: "Akira does not know that cache file." });
    return;
  }
  const job = peekFarmJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Akira is not holding that job." });
    return;
  }
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Akira expected a picture." });
    return;
  }
  writeCardCacheFile(cachedGroupFile(job.group, fileName), body);
  res.status(204).end();
});

farmRouter.post("/finish/:jobId", express.json(), (req, res) => {
  const jobId = Number(req.params["jobId"]);
  if (!Number.isInteger(jobId) || jobId < 0) {
    res.status(400).json({ error: "Akira does not know that job." });
    return;
  }
  const redrawn = typeof req.body?.redrawn === "number" ? req.body.redrawn : 0;
  const skipped = typeof req.body?.skipped === "number" ? req.body.skipped : 0;
  const view = finishFarmJob(bearer(req), jobId, { redrawn, skipped });
  if (!view) {
    res.status(401).json({ error: "Akira is not waiting for that token." });
    return;
  }
  res.json(view);
});
