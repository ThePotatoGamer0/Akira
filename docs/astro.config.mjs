import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://akira.local",
  outDir: "dist",
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
});
