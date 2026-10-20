import type { ButtonInteraction, Client, GuildMember, Message, StringSelectMenuInteraction, User } from "discord.js";
import { serverHasDropChannel, resolveDropChannelId } from "../game/drops.js";
import { isInitLocked } from "../utils/init-lock.js";
import { commandPrefix } from "./prefix.js";
import { acceptedValues, findControl, type StoredComponent } from "./component-controls.js";
import { dispatchMessageComponent } from "./component-dispatch.js";
import { performGrab } from "./events/reactions.js";
import { positionFromEmoji } from "../game/balance.js";

export class WebsiteActionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type WebsiteAction = {
  discordId: string;
  messageId: string;
  kind: "reaction" | "button" | "select";
  emojiName?: string;
  customId?: string;
  values?: string[];
};

type ComponentPayload = {
  content?: string | null;
  embeds?: unknown[];
  components?: unknown[];
  files?: unknown[];
  attachments?: unknown[];
  ephemeral?: boolean;
};

const inflight = new Set<string>();

function configuredGuildId(client: Client): string | null {
  const env = process.env["DISCORD_GUILD_ID"] ?? process.env["AKIRA_GUILD_ID"] ?? "";
  if (env) return env;
  if (client.guilds.cache.size === 1) return client.guilds.cache.first()?.id ?? null;
  return null;
}

function editBody(payload: ComponentPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if ("content" in payload) body["content"] = payload.content ?? "";
  if (payload.embeds) body["embeds"] = payload.embeds;
  if (payload.components) body["components"] = payload.components;
  if (payload.files) body["files"] = payload.files;
  if (payload.attachments) body["attachments"] = payload.attachments;
  return body;
}

function componentInteraction(
  message: Message,
  user: User,
  member: GuildMember | null,
  kind: "button" | "select",
  customId: string,
  values: string[],
): { interaction: ButtonInteraction | StringSelectMenuInteraction; notices: string[] } {
  const notices: string[] = [];
  const state: { replied: boolean; deferred: boolean; updated: boolean; sent: Message | null } = {
    replied: false,
    deferred: false,
    updated: false,
    sent: null,
  };

  const sendPublic = async (payload: ComponentPayload): Promise<Message> => {
    const channel = message.channel;
    if (!channel.isTextBased() || !("send" in channel)) {
      throw new WebsiteActionError("Akira can't answer in this channel.", 404);
    }
    const sent = await channel.send(editBody(payload) as never);
    state.sent = sent;
    state.replied = true;
    return sent;
  };

  const editOriginal = async (payload: ComponentPayload): Promise<Message> => {
    const edited = await message.edit(editBody(payload) as never);
    state.replied = true;
    state.updated = true;
    return edited;
  };

  const interaction = {
    customId,
    values,
    user,
    member,
    guild: message.guild,
    message,
    isButton: () => kind === "button",
    isStringSelectMenu: () => kind === "select",
    isChatInputCommand: () => false,
    get guildId() {
      return message.guildId;
    },
    get channelId() {
      return message.channelId;
    },
    get channel() {
      return message.channel;
    },
    get replied() {
      return state.replied;
    },
    get deferred() {
      return state.deferred;
    },
    reply: async (payload: ComponentPayload) => {
      state.replied = true;
      if (payload.ephemeral) {
        if (payload.content) notices.push(payload.content);
        return;
      }
      return sendPublic(payload);
    },
    update: async (payload: ComponentPayload) => editOriginal(payload),
    deferUpdate: async () => {
      state.deferred = true;
      state.updated = true;
    },
    deferReply: async () => {
      state.deferred = true;
      if (message.channel.isTextBased() && "sendTyping" in message.channel) {
        await message.channel.sendTyping();
      }
    },
    editReply: async (payload: ComponentPayload) => {
      state.replied = true;
      if (state.sent) {
        state.sent = await state.sent.edit(editBody(payload) as never);
        return state.sent;
      }
      if (state.updated) return editOriginal(payload);
      return sendPublic(payload);
    },
    followUp: async (payload: ComponentPayload) => {
      if (payload.ephemeral) {
        if (payload.content) notices.push(payload.content);
        return;
      }
      return sendPublic(payload);
    },
  };

  return { interaction: interaction as unknown as ButtonInteraction | StringSelectMenuInteraction, notices };
}

async function dropMessage(client: Client, messageId: string): Promise<Message> {
  const guildId = configuredGuildId(client);
  const channelId = guildId ? await resolveDropChannelId(guildId) : null;
  if (!guildId || !channelId || !(await serverHasDropChannel(guildId))) {
    throw new WebsiteActionError(
      `An admin needs to run \`${commandPrefix()}set\` in the channel where Akira should drop cards.`,
      404,
    );
  }
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || channel.isDMBased() || !("messages" in channel)) {
    throw new WebsiteActionError("Akira doesn't have a drop channel yet.", 404);
  }
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) throw new WebsiteActionError("Akira couldn't find that message.", 404);
  return message;
}

/** Run a drop grab, button, or menu as the signed-in player. Channel updates stay in Discord. */
export async function runWebsiteAction(client: Client, action: WebsiteAction): Promise<{ notice: string | null }> {
  if (isInitLocked()) throw new WebsiteActionError("Akira is still getting ready.", 503);
  if (!/^\d{17,20}$/.test(action.discordId) || !/^\d{17,22}$/.test(action.messageId)) {
    throw new WebsiteActionError("Akira couldn't tell which message that was.", 400);
  }
  const lock = `${action.discordId}:${action.messageId}:${action.kind}:${action.customId ?? action.emojiName ?? ""}`;
  if (inflight.has(lock)) throw new WebsiteActionError("Akira is already doing that.", 429);
  inflight.add(lock);
  try {
    const message = await dropMessage(client, action.messageId);
    const user = await client.users.fetch(action.discordId).catch(() => null);
    if (!user) throw new WebsiteActionError("Akira couldn't find that Discord account.", 404);

    if (action.kind === "reaction") {
      const emojiName = action.emojiName?.trim() ?? "";
      if (!emojiName || !positionFromEmoji(emojiName)) {
        throw new WebsiteActionError("That reaction isn't a card.", 400);
      }
      const listed = message.reactions.cache.some((reaction) => reaction.emoji.name === emojiName);
      if (!listed) throw new WebsiteActionError("That reaction isn't on this message.", 400);
      const outcome = await performGrab(message, emojiName, user);
      if (outcome === "missing") throw new WebsiteActionError("Akira couldn't find that drop.", 404);
      if (outcome === "skipped") throw new WebsiteActionError("Akira couldn't grab that card.", 400);
      return { notice: null };
    }

    const customId = action.customId?.trim() ?? "";
    const rows = message.components.map((row) => row.toJSON() as StoredComponent);
    const control = findControl(rows, customId);
    if (!control || control.disabled || control.url) {
      throw new WebsiteActionError("That control isn't on this message.", 400);
    }
    const kind = action.kind === "select" || control.type === 3 ? "select" : "button";
    if (kind === "button" && control.type !== undefined && control.type !== 2) {
      throw new WebsiteActionError("That control isn't on this message.", 400);
    }
    const values = action.values ?? [];
    if (kind === "select" && !acceptedValues(control, values)) {
      throw new WebsiteActionError("That choice isn't on this menu.", 400);
    }
    const member = message.guild ? await message.guild.members.fetch(user.id).catch(() => null) : null;
    const { interaction, notices } = componentInteraction(message, user, member, kind, customId, values);
    const matched = await dispatchMessageComponent(interaction);
    if (!matched && notices.length === 0) {
      throw new WebsiteActionError("Akira doesn't use that button.", 400);
    }
    return { notice: notices[0] ?? null };
  } finally {
    inflight.delete(lock);
  }
}
