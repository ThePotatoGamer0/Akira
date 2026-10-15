import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function htmlBypass(req: { headers: { accept?: string } }): string | undefined {
  if (req.headers.accept?.includes("text/html")) return "/index.html";
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/collection": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/economy": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/stats": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/leaderboard": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/admin": { target: "http://127.0.0.1:3333", changeOrigin: true, bypass: htmlBypass },
      "/api": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:3333", changeOrigin: true },
    },
  },
});
