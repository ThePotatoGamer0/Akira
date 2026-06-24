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

## Getting started locally

1. Clone the repository to your local machine.
2. Install dependencies using `npm install` in the root directory.
3. Run the database migrations using `npx prisma db push` to generate the local schema.
4. Start the development servers for the bot, server, and client.

If you are planning to build a substantial new feature, please drop a message in Discord first to ensure nobody else is already working on the same idea.

## See also

- [Updating documentation](/contributing/documentation)
- [Adding characters](/contributing/adding-characters)