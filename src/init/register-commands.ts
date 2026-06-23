import { REST, Routes } from "discord.js";
import type { AkiraCommand } from "../types/commands.js";
import { commands } from "../bot/commands/index.js";

const token = process.env["DISCORD_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];
const guildId = process.env["DISCORD_GUILD_ID"];

export async function registerSlashCommands(extra?: AkiraCommand[]): Promise<void> {
  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required to register commands.");
  }
  const body = [...commands, ...(extra ?? [])].map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
  }
}
