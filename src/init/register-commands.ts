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

function slashBody(extra?: AkiraCommand[]) {
  const body: ReturnType<AkiraCommand["data"]["toJSON"]>[] = [];
  for (const command of [...commands, ...(extra ?? [])]) {
    if (command.hidden) continue;
    const json = command.data.toJSON();
    const problem = requiredOrderProblem(json.options);
    if (problem) {
      console.error(`Skipping /${json.name}: ${problem}`);
      continue;
    }
    body.push(json);
  }
  return body;
}

type SlashOption = {
  name: string;
  required?: boolean | undefined;
  type: number;
  options?: SlashOption[] | undefined;
};

/** Discord refuses a command whose required option comes after an optional one. */
function requiredOrderProblem(options: SlashOption[] | undefined): string | null {
  if (!options) return null;
  for (const option of options) {
    if (option.options) {
      const nested = requiredOrderProblem(option.options);
      if (nested) return nested;
    }
  }
  const plain = options.filter((option) => option.type !== 1 && option.type !== 2);
  const firstOptional = plain.findIndex((option) => option.required !== true);
  if (firstOptional === -1) return null;
  const offender = plain.slice(firstOptional).find((option) => option.required === true);
  return offender ? `required option "${offender.name}" comes after an optional one` : null;
}

/** Guild commands show up quickly. Call this for every server the bot is in. */
export async function registerGuildCommands(targetGuildId: string, extra?: AkiraCommand[]): Promise<void> {
  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required to register commands.");
  }
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, targetGuildId), { body: slashBody(extra) });
}

export async function registerSlashCommands(extra?: AkiraCommand[]): Promise<void> {
  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required to register commands.");
  }
  const slash = slashBody(extra);
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
