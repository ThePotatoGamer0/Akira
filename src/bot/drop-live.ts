import { Events, type Client, type Message, type PartialMessage } from "discord.js";
import { resolveDropChannelId } from "../game/drops.js";
import { snapshotMessage } from "./drop-log.js";

type Send = (payload: string) => void;

const listeners = new Set<Send>();
let channelCache: { id: string | null; at: number } | null = null;

export function subscribeDropLive(send: Send): () => void {
  listeners.add(send);
  return () => listeners.delete(send);
}

function broadcast(payload: unknown): void {
  const text = JSON.stringify(payload);
  for (const send of listeners) send(text);
}

async function dropChannelId(client: Client): Promise<string | null> {
  if (channelCache && Date.now() - channelCache.at < 15_000) return channelCache.id;
  const env = process.env["DISCORD_GUILD_ID"] ?? process.env["AKIRA_GUILD_ID"] ?? "";
  const guildId = env || (client.guilds.cache.size === 1 ? client.guilds.cache.first()?.id : undefined);
  const id = guildId ? await resolveDropChannelId(guildId) : null;
  channelCache = { id, at: Date.now() };
  return id;
}

async function publish(kind: "message" | "update", message: Message | PartialMessage): Promise<void> {
  const channelId = await dropChannelId(message.client);
  if (!channelId || message.channelId !== channelId) return;
  const snapshot = await snapshotMessage(message);
  if (!snapshot) return;
  broadcast({ type: kind, message: snapshot });
}

/** Push drop-channel creates, edits, deletes, and reaction changes to WebUI listeners. */
export function bindDropLive(client: Client): void {
  client.on(Events.MessageCreate, (message) => {
    void publish("message", message).catch((err) => console.error("drop-live:", err));
  });
  client.on(Events.MessageUpdate, (_old, message) => {
    void publish("update", message).catch((err) => console.error("drop-live:", err));
  });
  client.on(Events.MessageDelete, (message) => {
    void (async () => {
      const channelId = await dropChannelId(message.client);
      if (!channelId || message.channelId !== channelId) return;
      broadcast({ type: "delete", id: message.id });
    })().catch((err) => console.error("drop-live:", err));
  });
  const onReaction = (message: Message | PartialMessage) => {
    void publish("update", message).catch((err) => console.error("drop-live:", err));
  };
  client.on(Events.MessageReactionAdd, (reaction) => onReaction(reaction.message));
  client.on(Events.MessageReactionRemove, (reaction) => onReaction(reaction.message));
  client.on(Events.MessageReactionRemoveAll, (message) => onReaction(message));
}
