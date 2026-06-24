import { defineConfig } from "astro/config";
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: "https://akira.potatogamer.uk",
  outDir: "dist",
  integrations: [
    mdx(), 
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en' },
      },
    })
  ],
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
});