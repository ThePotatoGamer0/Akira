---
title: Privacy Policy
description: What Akira stores about players, where it lives, and what stays on your device.
---

This policy explains what **Akira** collects when you use the Discord bot or the WebUI. Akira is a small open-source card game for friend groups. It is not an ad network and it does not sell player data.

Where you play matters: the **game database and WebUI API** live on the machine that hosts your community's instance (for example a home server). **This documentation site** is separate and does not hold your binder.

## What Akira stores about you

When you play, Akira keeps game and account records such as:

- Your **Discord user id**, and usually your **Discord username** and **avatar hash** so the bot and WebUI can recognise you
- An optional **preferred name** you set so Akira can address you
- Your **cards**, tags, bits, shop buffs, milestones, prestige, wishlists, cooldowns, and related game progress
- Optional **reminder** choices (for example daily, drop, or grab ready) and short **in-app notices** in the WebUI bell
- Channel activity that the bot already sees in Discord (drops, grabs, commands), including messages sent from the WebUI channel page through a webhook under your name

### WebUI sign-in

If you open the WebUI in a normal browser:

- Akira may DM you a **one-time code** so only you can link that browser session to your player
- You may set a **WebUI-only password**. That password is stored as a **hash** (not as plain text)
- A **session cookie** keeps you signed in on that browser. Session records sit next to the game database on the host

Inside Discord as an Activity, Discord already knows who you are, so Akira uses that identity instead of the username-and-password path.

### On your device

The WebUI may keep small preferences in your browser (for example theme, button buzz, left navigation, and some collection choices). Those stay on **that device** unless you clear site data.

## What Akira does not collect

Akira does not ask for your Discord password, email address, phone number, or payment details for normal play.

This project does not ship third-party advertising or analytics SDKs in the bot or WebUI client. Hosts and platforms outside Akira (Discord, Vercel for this docs site, your browser) still have their own policies.

## Why the data is kept

Akira needs this information to run the game: match drops and grabs to the right player, show your collection, remember settings, send reminder DMs you asked for, and keep WebUI sessions signed in.

## Who can see it

- Other players in your server can see public game state the bot already shows (for example cards in a drop, trades, and leaderboard-style stats your community uses)
- Server admins (and anyone with WebUI admin access on that instance) can look up players and cards to fix problems
- The people who **host** your instance can access the database files on that machine. If you care who that is, ask your server admin

The public GitHub repository holds **code and catalog art**, not your personal binder.

## Third parties

Akira talks to services only as needed to work:

- **Discord** — accounts, messages, DMs, reactions, and Activities
- **Giphy** — optional GIF search on the WebUI channel page when the host configures an API key ([Giphy's terms](https://support.giphy.com/hc/en-us/articles/360020027752-GIPHY-User-Terms-of-Service) apply to that search)
- **AniList** and similar sources — character and series catalog data for cards, not your personal profile

This documentation site may be hosted on **Vercel**. Visiting the docs does not sign you into the game.

## How long data lasts

Game progress stays until you leave the community's instance, an admin removes it, or the host deletes the database. Session cookies expire after a set time or when you sign out / clear cookies. One-time verification codes are short-lived.

## Your choices

- Change your preferred name and many WebUI preferences in [Settings](/webui/settings)
- Turn reminders off with `/reminders` or the same switches in Settings
- Clear browser site data to drop local preferences and cookies
- Ask your server admin if you want your player record removed from that instance's database

Because each community hosts its own copy, privacy requests for **game data** go to that host or admin, not to this documentation site alone.

## Children

Akira is built around Discord. Use Discord's own age and parental rules. Do not use Akira in a way that breaks those rules.

## Changes

This policy may be updated when how Akira stores data changes. The date below will move when it does.

## Contact

Questions about privacy for the project: [GitHub](https://github.com/thepotatogamer0/akira) or the [Akira Discord](https://discord.gg/H7BcjqtYgs). For data on a specific server's bot, talk to that server's admin or host.

*Last updated: 27 November 2026.*

## See also

- [Terms of Service](/legal/terms-of-service)
- [WebUI authentication](/webui/authentication)
- [Settings in the WebUI](/webui/settings)
- [What is Akira?](/getting-started/what-is-akira)
