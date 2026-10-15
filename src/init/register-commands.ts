import {
  ApplicationCommandType,
  EntryPointCommandHandlerType,
  REST,
  Routes,
  type APIApplicationCommand,
} from "discord.js";
import type { AkiraCommand } from "../types/commands.js";
import { commands } from "../bot/commands/index.js";

const token = process.env["DISCORD_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];
const guildId = process.env["DISCORD_GUILD_ID"];

const entryPoint = {
  name: "akira",
  type: ApplicationCommandType.PrimaryEntryPoint,
  handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
};

function keepGlobalCommand(command: APIApplicationCommand) {
  if (command.type === ApplicationCommandType.PrimaryEntryPoint) return null;
  const {
    id: _id,
    application_id: _applicationId,
    version: _version,
    guild_id: _guildId,
    description_localized: _descriptionLocalized,
    name_localized: _nameLocalized,
    ...rest
  } = command;
  return rest;
}

export async function registerSlashCommands(extra?: AkiraCommand[]): Promise<void> {
  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required to register commands.");
  }
  const slash = [...commands, ...(extra ?? [])].map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: slash });
    const global = (await rest.get(Routes.applicationCommands(clientId))) as APIApplicationCommand[];
    const kept = global.flatMap((command) => {
      const next = keepGlobalCommand(command);
      return next ? [next] : [];
    });
    await rest.put(Routes.applicationCommands(clientId), { body: [...kept, entryPoint] });
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: [...slash, entryPoint] });
  }
}
