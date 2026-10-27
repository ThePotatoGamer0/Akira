# Akira

The Discord bot and the WebUI API run together on the Pi. The docs site and the WebUI client run on Vercel.

[![Akira Status](https://badge.uptimerobot.com/psp/1ef6de73c77b068f1854841c0105e80c.svg?style=logo&theme=dark)](https://stats.uptimerobot.com/Zlw32vDcCg?utm_source=status_badge&utm_medium=referral)

## Pi (Portainer)

Each push to `main` builds this image in GitHub Actions and publishes `ghcr.io/thepotatogamer0/akira-bot:latest`. The build includes an arm64 copy for the Pi. In Portainer, add a stack from `docker-compose.yml` and pull that image. After a later push, pull the image again and recreate the container.

On the Pi, create `/home/james/akira-data/`. Set the variables below in the Portainer stack environment. The database file in that folder is `/data/akira.db` inside the container, and generated card pictures go in `/home/james/akira-data/cards`.

| Name | What it is |
| --- | --- |
| `DISCORD_TOKEN` | The bot token. |
| `DISCORD_CLIENT_ID` | The application id. |
| `DISCORD_CLIENT_SECRET` | The application secret. The activity uses it to match a Discord username to a player. |
| `DISCORD_GUILD_ID` | The server that already has a drop channel from `DISCORD_DROP_CHANNEL_ID`. Slash commands register in every server she joins. Leave the guild id empty to register slash commands globally instead. |
| `DISCORD_DROP_CHANNEL_ID` | The drop channel for `DISCORD_GUILD_ID`. Other servers stay quiet until an admin runs `aset` in the channel they want. |
| `AKIRA_INTERNAL_SECRET` | A long random string. The API uses it to ask the bot to send sign-in codes. |
| `SESSION_SECRET` | A different long random string for login cookies. |
| `WEBUI_ORIGINS` | The client’s public address, for example `https://akira.vercel.app`. A star covers one site and its subdomains, for example `https://*.potatogamer.uk`. Several addresses are separated by commas. |
| `GIPHY_API_KEY` | A Giphy API key. The channel GIF picker uses it. Leave it empty and GIF search stays off. |
| `AKIRA_FARM_URL` | Optional. Only if `afarm` prints the wrong address. The wifi URL your PC should use, for example `http://192.168.0.10:3333`. |

The stack publishes port **3333**. That is the API. Put HTTPS in front of it (Caddy, Traefik, or a Cloudflare tunnel). The browser will not keep a login cookie for a Vercel site unless the API is HTTPS.

`/home/james/akira-data/akira.db` is the database. `/home/james/akira-data/sessions.db` is WebUI logins, so pulling a new image does not sign people out. Keep `SESSION_SECRET` the same when you recreate the stack. `/home/james/akira-data/cards` is the generated card pictures.

Host prefix `arefresh` redraws that cache on the Pi. `afarm` pauses her and DMs you the Pi's wifi URL and a short code. On your PC, in the Akira folder, run the `npm run farm` line from that DM. The pictures come back over wifi and she returns. `afarm cancel` stops waiting.

Character art is inside the image. After you add characters, push to `main` and pull the new image on the Pi.

The first start seeds the catalog and registers slash commands. That can take a few minutes. Portainer should show the container healthy once `http://127.0.0.1:3333/health` answers.

## Vercel

Create two projects from this repository.

**Client.** Root directory `webui/client`. Framework Vite. Set these before the first build:

- `VITE_API_URL` is the API’s public address, with no slash at the end. Example: `https://akira-api.example.com`
- `VITE_DISCORD_CLIENT_ID` is the same application id as on the Pi, for the Discord Activity. In the developer portal, under Activities → URL Mappings, add a prefix `/api` whose target is the API host with no `https://`. Discord’s activity proxy blocks every other address, so the activity sends API calls to `/api` and Discord forwards them.

**Docs.** Root directory `docs`. Framework Astro. No API variables.

`WEBUI_ORIGINS` on the Pi must include the client’s address. `https://*.potatogamer.uk` allows `https://potatogamer.uk` and any subdomain of it. After you change it, redeploy the stack. Signing in from that site sends the browser to the Pi, and the cookie is allowed because that origin was listed.
