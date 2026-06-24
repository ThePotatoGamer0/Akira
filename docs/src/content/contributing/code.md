---
title: Contributing code
description: Help build the bot and WebUI by setting up the repo locally and opening a PR.
---

Akira is built as a monorepo containing the Discord bot, the React WebUI, and the Astro documentation site. 

## Tech stack

- **Bot:** TypeScript, Discord.js
- **WebUI:** React, Vite
- **Database:** Prisma (SQLite for local development)
- **Docs:** Astro

## Getting started

If you are already familiar with the Node.js ecosystem, here is the quick start:

1. Clone the repository.
2. Run `npm install` in the root directory.
3. Run `npx prisma db push` to generate the local SQLite schema.
4. Start the development servers.

If you are new to the tech stack or need a detailed walkthrough of installing dependencies like `npm` and running the development servers from scratch, check out our [Local environment setup](/contributing/local-setup) guide.

If you are planning to build a substantial new feature, please drop a message in Discord first to ensure nobody else is already working on the same idea.

## See also

- [Local environment setup](/contributing/local-setup)
- [Updating documentation](/contributing/documentation)
- [Adding characters](/contributing/adding-characters)