/**
 * Push slash commands to Discord (guild or global) using DISCORD_* from .env.
 * The bot process does not do this automatically — run after changing command definitions.
 */
import "dotenv/config";
import { registerSlashCommands } from "./init/register-commands.js";

await registerSlashCommands();
console.log("Slash commands registered with Discord.");
