---
title: Local environment setup
description: A complete, step-by-step beginner's guide to setting up the Akira project on your computer.
---

<!-- FUTURE EDITORS: Please add installation instructions for macOS and other Linux distributions (Ubuntu, Fedora, etc.) below as needed. -->

If you want to contribute code to Akira but have never used Node.js or Prisma before, this guide will walk you through the entire process from zero to a running development server.

## 1. Install prerequisites

Before you can run the project, your computer needs the right software to understand the code. You will need **Git** (to download the code) and **Node.js** (which includes **npm**, the tool that installs our project dependencies). 

To install these tools, run the following commands or use the installers for your operating system:

- **Windows 11:** Download and run the official installers from the [Node.js website](https://nodejs.org/) and [Git website](https://git-scm.com/). Alternatively, if you use Winget, open PowerShell and run `winget install OpenJS.NodeJS` and `winget install Git.Git`.
- **Arch Linux (CachyOS, SteamOS, etc.):** Open your terminal and install the packages using your preferred package manager (e.g., `sudo pacman -S nodejs npm git`, `paru -S nodejs npm git`, or `yay -S nodejs npm git`).

## 2. Clone the repository

Open your terminal (or Command Prompt/PowerShell) and download the project files using Git:

```bash
git clone [https://github.com/YOUR_USERNAME/Akira.git](https://github.com/YOUR_USERNAME/Akira.git)
cd Akira
```

## 3. Install project dependencies

The project relies on external libraries (like React and Discord.js). **npm** (Node Package Manager) will read the `package.json` file and download everything you need.

In the root of the `Akira` folder, run:

```bash
npm install
```

## 4. Prepare the database

Akira uses Prisma to talk to the database. For local development, it creates a simple SQLite file so you don't have to configure a full database server.

Generate the database schema and the local database file by running:

```bash
npx prisma db push
```

## 5. Start the development servers

Because Akira is a monorepo, it has several moving parts (the Discord bot, the WebUI server, the WebUI client, and the Astro docs site). 

Open separate terminal windows for each part of the project you want to work on and run their start commands:

- **To run the Astro documentation site:**
```bash
  cd docs
  npm run dev
  ```

- **To run the WebUI Client:**
```bash
  cd webui/client
  npm run dev
  ```

- **To run the Bot or Server:**
  Run your standard build/start scripts from the root directory as defined in the main `package.json`.

You are now ready to make changes to the code!

## See also

- [Contributing code](/contributing/code)
- [Updating documentation](/contributing/documentation)