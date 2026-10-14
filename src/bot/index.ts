import "dotenv/config";
import fs from "node:fs";
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import { commandMap } from "./commands/index.js";
import { INIT_LOCK } from "../utils/paths.js";
import { isInitLocked } from "../utils/init-lock.js";
import { waitingMessage } from "./voice.js";
import { startInternalApi } from "./internal-http.js";
import { handleCollectionButton } from "./commands/collection.js";
import { handleLookupButton, handleLookupSelect } from "./commands/lookup.js";
import { resumeDropExpiries } from "./drop-expiry.js";
import { bindReminderClient, resumeReminders } from "./reminder-schedule.js";
import { registerReactionHandler } from "./events/reactions.js";
import { lastGrabbedCard, shortenLegacyCardCodes } from "../game/cards.js";
import { guildListensForKaruta, handleKarutaOverride, handleKarutaOverrideButton, KARUTA_PREFIXES, loadKarutaGuilds } from "./karuta-override.js";
import { commandPrefix, createPrefixInteraction, invocationIsExpected, matchPrefixedCommand, resolveLegacyCommand, viewCardArgument } from "./prefix.js";

const token = process.env["DISCORD_TOKEN"];
if (!token) {
  console.error("DISCORD_TOKEN is missing.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

function setWaitingPresence(): void {
  client.user?.setPresence({
    activities: [
      {
        name: "Akira is getting ready...",
        type: ActivityType.Playing,
      },
    ],
    status: "online",
  });
}

function setReadyPresence(): void {
  client.user?.setPresence({
    activities: [{ name: "with cards", type: ActivityType.Playing }],
    status: "online",
  });
}

function watchInitLock(): void {
  fs.watchFile(INIT_LOCK, { interval: 1500 }, () => {
    if (!isInitLocked()) {
      setReadyPresence();
    } else {
      setWaitingPresence();
    }
  });
}

registerReactionHandler(client);
bindReminderClient(client);

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  startInternalApi(c);
  void shortenLegacyCardCodes()
    .then(() => resumeDropExpiries(c))
    .then(() => resumeReminders())
    .catch((err) => console.error(err));
  if (isInitLocked()) {
    setWaitingPresence();
  } else {
    setReadyPresence();
  }
  watchInitLock();
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || isInitLocked()) return;
  const prefixes = [commandPrefix()];
  if (guildListensForKaruta(message.guildId)) prefixes.push(...KARUTA_PREFIXES);
  const parsed = matchPrefixedCommand(message.content, prefixes);
  if (!parsed) return;
  if (parsed.name === "overridekaruta") {
    if (parsed.rest !== "") return;
    try {
      await handleKarutaOverride(message);
    } catch (err) {
      console.error(err);
    }
    return;
  }
  const route = resolveLegacyCommand(parsed.name);
  const cmd = commandMap.get(route.command);
  if (!cmd) return;
  let rest = parsed.rest;
  if (route.command === "view" && rest === "") {
    const last = viewCardArgument(rest, await lastGrabbedCard(message.author.id));
    if (!last) return;
    rest = last;
  }
  if (!invocationIsExpected(cmd, rest, route.subcommand)) return;
  const interaction = createPrefixInteraction(message, cmd, rest, route.subcommand);
  try {
    await cmd.execute(interaction, client);
  } catch (err) {
    console.error(err);
    const text = err instanceof Error && err.message.startsWith("Akira")
      ? err.message
      : "Akira tripped over something. Mind trying again in a moment?";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: text }).catch(() => undefined);
    } else {
      await interaction.reply({ content: text }).catch(() => undefined);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (isInitLocked()) return;
    try {
      if (await handleKarutaOverrideButton(interaction)) return;
      if (await handleCollectionButton(interaction)) return;
      await handleLookupButton(interaction);
    } catch (err) {
      console.error(err);
    }
    return;
  }
  if (interaction.isStringSelectMenu()) {
    if (isInitLocked()) return;
    try {
      await handleLookupSelect(interaction);
    } catch (err) {
      console.error(err);
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  if (isInitLocked()) {
    await interaction.reply({ content: waitingMessage, ephemeral: true });
    return;
  }
  const cmd = commandMap.get(interaction.commandName);
  if (!cmd) {
    await interaction.reply({
      content: "Akira doesn't recognize that command - try `/help`.",
      ephemeral: true,
    });
    return;
  }
  try {
    await cmd.execute(interaction, client);
  } catch (err) {
    console.error(err);
    const msg = "Akira tripped over something. Mind trying again in a moment?";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

await loadKarutaGuilds();
await client.login(token);
