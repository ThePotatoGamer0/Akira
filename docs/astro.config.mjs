import { defineConfig } from "astro/config";
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: "https://akira.potatogamer.uk",
  outDir: "dist",
  integrations: [mdx()], // Removed sitemap()
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
});