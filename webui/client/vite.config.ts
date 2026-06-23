import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/collection": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/economy": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/leaderboard": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/admin": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/api": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:3333", changeOrigin: true },
    },
  },
});
