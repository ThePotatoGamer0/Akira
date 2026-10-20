import "dotenv/config";
import fs from "node:fs";
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type Message,
  type RepliableInteraction,
} from "discord.js";
import { commandMap } from "./commands/index.js";
import { INIT_LOCK } from "../utils/paths.js";
import { isInitLocked } from "../utils/init-lock.js";
import { waitingMessage } from "./voice.js";
import { startInternalApi } from "./internal-http.js";
import { handleCollectionButton } from "./commands/collection.js";
import { handlePrestigeButton } from "./commands/prestige.js";
import { handleShopButton } from "./commands/shop.js";
import { startPoolSchedule } from "./pool-midnight.js";
import { handleBurnConfirmButton, offerLastGrabBurn } from "./commands/burn.js";
import { handleMultiburnButton } from "./commands/multiburn.js";
import { handleMultitradeButton, handleMultitradeMessage } from "./commands/multitrade.js";
import { handleTransferButton } from "./commands/transfer.js";
import { handleLookupButton, handleLookupSelect, replyCharacterEdition } from "./commands/lookup.js";
import { resumeDropExpiries } from "./drop-expiry.js";
import { startDropShelf } from "./drop-shelf.js";
import { startOutageWatch } from "../game/outage.js";
import { resumeGrabNotices } from "./grab-notices.js";
import { bindReminderClient, resumeReminders } from "./reminder-schedule.js";
import { startDmCleanup } from "./dm-mailbox.js";
import { easterEgg, easterEggFromMessage } from "./easter-eggs.js";
import { registerReactionHandler } from "./events/reactions.js";
import { getCard, lastGrabbedCard, shortenLegacyCardCodes } from "../game/cards.js";
import { GameError } from "../game/errors.js";
import { guildListensForKaruta, handleKarutaOverride, handleKarutaOverrideButton, KARUTA_PREFIXES, loadKarutaGuilds } from "./karuta-override.js";
import { commandPrefix, createPrefixInteraction, invocationIsExpected, matchPrefixedCommand, resolveLegacyCommand, viewCardArgument } from "./prefix.js";
import { adoptWebsiteSpeaker } from "./website-message.js";
import { syncApplicationIcons } from "./icon-sync.js";
import { serverHasDropChannel } from "../game/drops.js";
import { collaborativeAction, hostIsInGuild, privateServerMessage } from "./host-gate.js";
import { registerGuildCommands } from "../init/register-commands.js";

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

function setupHint(): string {
  return `An admin needs to run \`${commandPrefix()}set\` in the channel where Akira should drop cards.`;
}

async function serverIsReady(guildId: string | null, commandName: string): Promise<boolean> {
  if (!guildId || commandName === "set") return true;
  return serverHasDropChannel(guildId);
}

async function refusePrivateServer(
  guild: Guild | null,
  commandName: string,
  reply: (content: string) => Promise<unknown>,
): Promise<boolean> {
  const action = collaborativeAction(commandName);
  if (!action) return false;
  if (await hostIsInGuild(guild)) return false;
  await reply(privateServerMessage(action));
  return true;
}

async function refuseUnsetServer(interaction: RepliableInteraction): Promise<boolean> {
  const commandName = interaction.isChatInputCommand() ? interaction.commandName : "";
  if (await serverIsReady(interaction.guildId, commandName)) return false;
  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({ content: setupHint(), ephemeral: true }).catch(() => undefined);
  }
  return true;
}

function canAnnounce(channel: GuildBasedChannel, guild: Guild): boolean {
  const me = guild.members.me;
  if (!me || !channel.isTextBased()) return false;
  return channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ?? false;
}

async function welcomeServer(guild: Guild): Promise<void> {
  if (Date.now() - guild.joinedTimestamp > 2 * 60 * 1000) return;
  if (await serverHasDropChannel(guild.id)) return;
  if (!guild.members.me) await guild.members.fetchMe();
  await guild.channels.fetch().catch(() => undefined);
  const system = guild.systemChannel;
  const channel =
    (system && canAnnounce(system, guild) ? system : null) ??
    guild.channels.cache.find((candidate) => canAnnounce(candidate, guild));
  if (!channel?.isTextBased()) return;
  await channel.send(
    `An admin can run \`${commandPrefix()}set\` in the channel where Akira should drop cards. She'll ignore other commands until then.`,
  );
}

async function registerEveryGuild(client: Client<true>): Promise<void> {
  const guilds = await client.guilds.fetch();
  for (const [guildId] of guilds) {
    await registerGuildCommands(guildId).catch((err) => {
      console.error(`Slash registration failed for ${guildId}.`, err);
    });
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  startInternalApi(c);
  startPoolSchedule(c);
  void registerEveryGuild(c).catch((err) => console.error(err));
  startDmCleanup(c);
  startDropShelf();
  startOutageWatch();
  void syncApplicationIcons()
    .catch((err) => console.error("Lucide icon sync failed.", err))
    .then(() => shortenLegacyCardCodes())
    .then(() => resumeDropExpiries(c))
    .then(() => resumeGrabNotices(c))
    .then(() => resumeReminders())
    .catch((err) => console.error(err));
  if (isInitLocked()) {
    setWaitingPresence();
  } else {
    setReadyPresence();
  }
  watchInitLock();
});

client.on(Events.GuildCreate, (guild) => {
  void registerGuildCommands(guild.id).catch((err) => {
    console.error(`Slash registration failed for ${guild.id}.`, err);
  });
  void welcomeServer(guild).catch((err) => console.error(err));
});

client.on(Events.MessageCreate, async (message) => {
  if (isInitLocked()) return;
  const speaker = await adoptWebsiteSpeaker(message);
  if (message.author.bot && !speaker) return;
  await handleGuildMessage(speaker ?? message);
});

async function handleGuildMessage(message: Message): Promise<void> {
  const prefixes = [commandPrefix()];
  if (guildListensForKaruta(message.guildId)) prefixes.push(...KARUTA_PREFIXES);
  const parsed = matchPrefixedCommand(message.content, prefixes);
  if (!parsed) {
    const egg = easterEggFromMessage(message.content, [commandPrefix(), "a", "k!", "k"]);
    if (egg) {
      await message.reply(egg);
      return;
    }
    await handleMultitradeMessage(message, client);
    return;
  }
  const commandName = parsed.name === "overridekaruta" ? parsed.name : resolveLegacyCommand(parsed.name).command;
  const earlyRoute = resolveLegacyCommand(parsed.name);
  if (parsed.name !== "overridekaruta" && !commandMap.get(earlyRoute.command)) {
    const egg = easterEgg(parsed.name, parsed.rest);
    if (egg) {
      await message.reply(egg);
      return;
    }
  }
  if (
    await refusePrivateServer(message.guild, commandName, (content) => message.reply(content))
  ) {
    return;
  }
  if (!(await serverIsReady(message.guildId, commandName))) return;
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
  if (!cmd) {
    await handleMultitradeMessage(message, client);
    return;
  }
  let rest = parsed.rest;
  if (route.command === "view" && rest === "") {
    const last = viewCardArgument(rest, await lastGrabbedCard(message.author.id));
    if (!last) return;
    rest = last;
  }
  if (route.command === "lookup" && rest === "") {
    const last = await lastGrabbedCard(message.author.id);
    if (!last) return;
    const card = await getCard(last);
    const interaction = createPrefixInteraction(message, cmd, rest);
    try {
      if (!card) {
        await interaction.reply({ content: `Akira couldn't find a card with the id \`${last}\`.` });
        return;
      }
      await replyCharacterEdition(
        interaction,
        card.variant.character.id,
        card.variant.id,
        card.variant.character.name,
      );
    } catch (err) {
      console.error(err);
      const text = err instanceof Error && err.message.startsWith("Akira")
        ? err.message
        : "Akira tripped over something. Mind trying again in a moment?";
      await interaction.reply({ content: text }).catch(() => undefined);
    }
    return;
  }
  if (route.command === "burn" && rest === "") {
    try {
      await offerLastGrabBurn(message);
    } catch (err) {
      console.error(err);
      const text = err instanceof GameError
        ? err.message
        : "Akira tripped over something. Mind trying again in a moment?";
      await message.reply(text).catch(() => undefined);
    }
    return;
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
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (isInitLocked()) return;
    if (await refuseUnsetServer(interaction)) return;
    try {
      if (await handleKarutaOverrideButton(interaction)) return;
      if (await handleBurnConfirmButton(interaction)) return;
      if (await handleMultiburnButton(interaction)) return;
      if (await handleMultitradeButton(interaction)) return;
      if (await handleTransferButton(interaction)) return;
      if (await handleShopButton(interaction)) return;
      if (await handlePrestigeButton(interaction)) return;
      if (await handleCollectionButton(interaction)) return;
      await handleLookupButton(interaction);
    } catch (err) {
      console.error(err);
    }
    return;
  }
  if (interaction.isStringSelectMenu()) {
    if (isInitLocked()) return;
    if (await refuseUnsetServer(interaction)) return;
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
  if (
    await refusePrivateServer(interaction.guild, interaction.commandName, (content) =>
      interaction.reply({ content, ephemeral: true }),
    )
  ) {
    return;
  }
  if (await refuseUnsetServer(interaction)) return;
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
