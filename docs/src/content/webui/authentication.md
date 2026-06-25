---
title: WebUI authentication
description: What you actually do to sign in - inside Discord versus in a normal browser.
---

You do not pick a "mode." **Where you open Akira** decides how simple sign-in is.

## Opening Akira inside Discord

If your community uses the WebUI **as an Activity inside Discord** (it opens in Discord instead of Chrome or Safari), you usually **do not** enter a password or a code. Discord already knows who you are, and Akira drops you straight into the app.

First time here? You might still see a loading moment while your account is set up - that is normal.

## Opening Akira in a normal browser

If you visit the site in **Firefox, Chrome, Edge, etc.**, Akira cannot "see" your Discord session the same way. You go through a short **DM check** so only you can open **your** binder:

1. Enter the **Discord username** Akira knows you by (the same name you use with the bot in the server).
2. **Open your Discord DMs** - Akira sends you a **one-time code**.
3. Paste that code into the WebUI. If it is still valid, you are in - or you may be asked for one more step below.
4. **First time only:** you may be asked to **choose a site password**. This is **only for the WebUI** in the browser - keep it separate from your Discord login.
5. **Next times:** you can sign in with **username + site password** so you do not need a fresh DM every visit.

**Before this can work:** Akira must have your **Discord handle** on file. In the server, run **`/ping`** or **`/help`** once (either command saves your name for the WebUI). Then use that **same handle**, lower case, on the WebUI username step - no `discriminator` numbers on newer Discord accounts. If she still cannot find you, ask your server admin.

## Rough edges

The **sign-in screens and wording** may still feel plain or change as the WebUI grows. The important part for you: **inside Discord** should feel instant; **in a browser** is username → DM code → (optional first-time password) → later username + password.

## See also

- [Collection in the WebUI](/webui/collection)
- [Economy & leaderboard in the WebUI](/webui/economy-and-leaderboard)
- [Your first card](/getting-started/your-first-card)
