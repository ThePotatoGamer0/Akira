import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://akira.local",
  outDir: "dist",
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
});
