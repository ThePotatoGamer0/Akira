import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function htmlBypass(req: { headers: { accept?: string } }): string | undefined {
  if (req.headers.accept?.includes("text/html")) return "/index.html";
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
    proxy: {
      "/auth": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/collection": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/economy": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/stats": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/leaderboard": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/admin": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/channel": { target: "http://127.0.0.1:3333", changeOrigin: true, ws: true, bypass: htmlBypass },
      "/notices": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/reminders": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/api": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:3333", changeOrigin: true },
    },
  },
});
