import { defineConfig } from "astro/config";
import mdx from '@astrojs/mdx';

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
