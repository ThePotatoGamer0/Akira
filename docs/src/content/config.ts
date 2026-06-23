import { defineCollection, z } from "astro:content";

const schema = z.object({
  title: z.string(),
  description: z.string(),
  command: z.string().optional(),
  shortcuts: z.string().optional(),
});

export const collections = {
  commands: defineCollection({ type: "content", schema }),
  economy: defineCollection({ type: "content", schema }),
  prestige: defineCollection({ type: "content", schema }),
  "getting-started": defineCollection({ type: "content", schema }),
  webui: defineCollection({ type: "content", schema }),
};
