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

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  startInternalApi(c);
  if (isInitLocked()) {
    setWaitingPresence();
  } else {
    setReadyPresence();
  }
  watchInitLock();
});

client.on(Events.InteractionCreate, async (interaction) => {
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

await client.login(token);
