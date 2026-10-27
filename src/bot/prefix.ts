import {
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  type Message,
  type User,
} from "discord.js";
import { isCardCode } from "../game/codes.js";
import { filtersAreInvocable } from "../game/filters.js";
import type { AkiraCommand } from "../types/commands.js";

export function commandPrefix(): string {
  const configured = process.env["AKIRA_PREFIX"]?.trim();
  return configured ? configured : "a";
}

/** Karuta's shortcuts for commands Akira actually has. Jobs, workers, and clans are left out. */
const LEGACY_ALIASES: Record<string, { command: string; subcommand?: string }> = {
  d: { command: "drop" },
  b: { command: "burn" },
  mb: { command: "multiburn" },
  c: { command: "collection" },
  col: { command: "collection" },
  v: { command: "view" },
  cd: { command: "cooldowns" },
  timers: { command: "cooldowns" },
  lu: { command: "lookup" },
  search: { command: "lookup" },
  find: { command: "lookup" },
  ui: { command: "userinfo" },
  whois: { command: "userinfo" },
  wl: { command: "wishlist" },
  wa: { command: "wishlist", subcommand: "add" },
  wish: { command: "wishlist", subcommand: "add" },
  wishadd: { command: "wishlist", subcommand: "add" },
  wr: { command: "wishlist", subcommand: "remove" },
  wishremove: { command: "wishlist", subcommand: "remove" },
  g: { command: "give" },
  mt: { command: "multitrade" },
  i: { command: "inventory" },
  inv: { command: "inventory" },
  items: { command: "inventory" },
  is: { command: "shop" },
  itemshop: { command: "shop" },
  rm: { command: "reminders" },
  remind: { command: "reminders" },
  t: { command: "tag" },
  tl: { command: "taglist" },
  tags: { command: "taglist" },
  tagadd: { command: "tagcreate" },
  ta: { command: "tagcreate" },
  tc: { command: "tagcreate" },
  tagremove: { command: "tagdelete" },
  tr: { command: "tagdelete" },
  td: { command: "tagdelete" },
  ut: { command: "untag" },
};

export function resolveLegacyCommand(name: string): { command: string; subcommand?: string } {
  return LEGACY_ALIASES[name] ?? { command: name };
}

type CommandOption = {
  name: string;
  type: number;
  required?: boolean | undefined;
  options?: CommandOption[] | undefined;
};

function isUserToken(token: string): boolean {
  return /^<@!?\d+>$/.test(token);
}

/** Card codes and reminder actions are one word. A character name takes the rest of the message. */
function isSingleToken(field: CommandOption): boolean {
  return field.name === "card_id" || field.name === "their_card" || field.name === "action" || field.name === "tag_name" || field.name === "emoji";
}

function isCardIdList(field: CommandOption): boolean {
  return field.name === "card_ids";
}

function isFilterField(field: CommandOption): boolean {
  return field.name === "filters";
}

function isCardToken(token: string): boolean {
  return isCardCode(token.toLowerCase());
}

/** Mentions, card codes, and commas from a multitrade-style list. */
export function splitPrefixArgs(rest: string): string[] {
  return rest.length > 0 ? rest.split(/[,\s]+/).filter((part) => part.length > 0) : [];
}

function optionFields(options: CommandOption[], rest: string, forcedSubcommand?: string): { fields: CommandOption[]; args: string[] } {
  const tokens = splitPrefixArgs(rest);
  const subs = options.filter((option) => option.type === ApplicationCommandOptionType.Subcommand);
  if (forcedSubcommand) {
    const sub = subs.find((option) => option.name === forcedSubcommand);
    return { fields: sub?.options ?? [], args: tokens };
  }
  if (subs.length === 0) {
    return {
      fields: options.filter((option) => option.type !== ApplicationCommandOptionType.SubcommandGroup),
      args: tokens,
    };
  }
  const first = tokens[0]?.toLowerCase();
  const known = subs.find((option) => option.name === first);
  const sub = known ?? subs.find((option) => option.name === "show") ?? subs[0];
  return { fields: sub?.options ?? [], args: known ? tokens.slice(1) : tokens };
}

/**
 * Tokens a message actually supplies for each field. A mention can come
 * anywhere, so `/trade` keeps its required card codes first for Discord and
 * still reads `atrade @them card1 card2` from chat.
 */
function planTokens(fields: CommandOption[], args: string[]): Map<CommandOption, string[]> | null {
  const userFields = fields.filter((field) => field.type === ApplicationCommandOptionType.User);
  const looseMentions: string[] = [];
  if (userFields.length > 0) {
    args = args.filter((token) => {
      if (!isUserToken(token)) return true;
      if (userFields.some((field) => !looseMentions.includes(token)) && looseMentions.length < userFields.length) {
        looseMentions.push(token);
        return false;
      }
      return true;
    });
  }
  const planned = new Map<CommandOption, string[]>();
  let index = 0;
  for (const field of fields) {
    if (field.type === ApplicationCommandOptionType.User) {
      const mention = looseMentions.shift();
      planned.set(field, mention ? [mention] : []);
      continue;
    }
    if (isCardIdList(field)) {
      const ids: string[] = [];
      while (index < args.length && isCardToken(args[index] ?? "")) {
        const token = args[index++] ?? "";
        // Chat allows `card1,card2`; a slash command needs the comma gone.
        ids.push(...token.split(",").filter((part) => part.length > 0));
      }
      planned.set(field, ids);
      continue;
    }
    if (isFilterField(field) || (field.type === ApplicationCommandOptionType.String && !isSingleToken(field))) {
      planned.set(field, args.slice(index));
      index = args.length;
      continue;
    }
    planned.set(field, index < args.length ? [args[index++] ?? ""] : []);
  }
  if (index !== args.length) return null;
  return planned;
}

/** True when the text after the command is empty, or exactly the options that command accepts. */
export function invocationIsExpected(command: AkiraCommand, rest: string, forcedSubcommand?: string): boolean {
  const options = (command.data.toJSON().options ?? []) as CommandOption[];
  const { fields, args } = optionFields(options, rest, forcedSubcommand);
  const planned = planTokens(fields, args);
  if (!planned) return false;
  for (const field of fields) {
    const tokens = planned.get(field) ?? [];
    const required = field.required === true;
    if (field.type === ApplicationCommandOptionType.User) {
      if (required && tokens.length === 0) return false;
      continue;
    }
    if (isCardIdList(field)) {
      if (required && tokens.length === 0) return false;
      continue;
    }
    if (isFilterField(field)) {
      return filtersAreInvocable(tokens.join(" "));
    }
    if (field.type === ApplicationCommandOptionType.String && !isSingleToken(field)) {
      if (tokens.length === 0) return !required;
      return true;
    }
    if (tokens.length === 0 && required) return false;
  }
  return true;
}

function fieldsForSub(options: CommandOption[], sub: string): CommandOption[] {
  const subs = options.filter((option) => option.type === ApplicationCommandOptionType.Subcommand);
  if (subs.length === 0) {
    return options.filter((option) => option.type !== ApplicationCommandOptionType.SubcommandGroup);
  }
  return subs.find((option) => option.name === sub)?.options ?? [];
}

/** Values a prefix message supplied, using the same token rules as invocationIsExpected. */
export function prefixOptionValues(fields: CommandOption[], args: string[]): Map<string, string> {
  const values = new Map<string, string>();
  const planned = planTokens(fields, args);
  if (!planned) return values;
  for (const field of fields) {
    const tokens = planned.get(field) ?? [];
    if (tokens.length === 0) continue;
    if (field.type === ApplicationCommandOptionType.User) {
      values.set(field.name, (tokens[0] ?? "").replace(/\D/g, ""));
      continue;
    }
    if (isCardIdList(field)) {
      values.set(field.name, tokens.map((token) => token.toLowerCase()).join(" "));
      continue;
    }
    values.set(field.name, tokens.join(" "));
  }
  return values;
}

/** Try the longest prefix first so `k!` is not parsed as `k` plus `!drop`. */
export function matchPrefixedCommand(
  content: string,
  prefixes: readonly string[],
): { name: string; rest: string } | null {
  const ordered = [...prefixes].sort((a, b) => b.length - a.length);
  for (const prefix of ordered) {
    const parsed = parsePrefixedCommand(content, prefix);
    if (parsed) return parsed;
  }
  return null;
}

/** A bare view uses the card the player just grabbed. Any typed code wins. */
export function viewCardArgument(rest: string, lastCardId: string | null): string | null {
  const typed = rest.trim();
  if (typed.length > 0) return typed;
  return lastCardId;
}

export function parsePrefixedCommand(content: string, prefix = commandPrefix()): { name: string; rest: string } | null {
  const trimmed = content.trim();
  if (trimmed.length <= prefix.length) return null;
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const body = trimmed.slice(prefix.length).trim();
  if (!body) return null;
  const splitAt = body.search(/\s/);
  if (splitAt === -1) return { name: body.toLowerCase(), rest: "" };
  return {
    name: body.slice(0, splitAt).toLowerCase(),
    rest: body.slice(splitAt + 1).trim(),
  };
}

type ReplyBody = {
  content?: string | null | undefined;
  embeds?: unknown[] | undefined;
  files?: unknown[] | undefined;
  components?: unknown[] | undefined;
  attachments?: unknown[] | undefined;
};

function publicBody(payload: ReplyBody): ReplyBody {
  return {
    content: payload.content ?? undefined,
    embeds: payload.embeds,
    files: payload.files,
    components: payload.components,
  };
}

export function createPrefixInteraction(
  message: Message,
  command: AkiraCommand,
  rest: string,
  forcedSubcommand?: string,
): ChatInputCommandInteraction {
  const json = command.data.toJSON();
  const options = json.options ?? [];
  const subcommands = options.filter((option) => option.type === ApplicationCommandOptionType.Subcommand);
  const tokens = splitPrefixArgs(rest);
  let sub = forcedSubcommand ?? subcommands[0]?.name ?? "show";
  let argTokens = tokens;
  if (!forcedSubcommand && subcommands.length > 0) {
    const first = tokens[0]?.toLowerCase();
    const known = subcommands.find((option) => option.name === first);
    if (known) {
      sub = known.name;
      argTokens = tokens.slice(1);
    } else {
      sub = subcommands.find((option) => option.name === "show")?.name ?? sub;
    }
  }
  const argText = argTokens.join(" ").trim();
  const mentioned = message.mentions.users.first() ?? null;
  const optionValues = prefixOptionValues(fieldsForSub(options, sub), argTokens);

  const state: { replied: boolean; deferred: boolean; sent: Message | null } = {
    replied: false,
    deferred: false,
    sent: null,
  };

  const send = async (payload: ReplyBody): Promise<Message> => {
    const channel = message.channel;
    if (!channel.isTextBased() || !("send" in channel)) {
      throw new Error("Akira can't answer in this channel.");
    }
    const sent = await channel.send(publicBody(payload) as never);
    state.sent = sent;
    state.replied = true;
    return sent;
  };

  const interaction = {
    commandName: json.name,
    get guildId() {
      return message.guildId;
    },
    get channelId() {
      return message.channelId;
    },
    get user() {
      return message.author;
    },
    get replied() {
      return state.replied;
    },
    get deferred() {
      return state.deferred;
    },
    options: {
      getSubcommand: () => sub,
      getString: (name: string, required?: boolean) => {
        const exact = name === "card_id" || name === "their_card" || name === "action" || name === "tag_name" || name === "emoji" || name === "card_ids" || name === "filters";
        const value = optionValues.get(name) ?? (exact ? "" : argText);
        if (!value) {
          if (required) throw new Error(`Akira needs a ${name.replaceAll("_", " ")} for that.`);
          return null;
        }
        return value;
      },
      getInteger: (name: string, required?: boolean) => {
        const raw = optionValues.get(name);
        if (!raw) {
          if (required) throw new Error(`Akira needs a ${name.replaceAll("_", " ")} for that.`);
          return null;
        }
        const parsed = Number(raw);
        if (!Number.isInteger(parsed)) return null;
        return parsed;
      },
      getUser: (name?: string): User | null => {
        if (name && optionValues.has(name)) {
          return message.mentions.users.get(optionValues.get(name) ?? "") ?? null;
        }
        return mentioned;
      },
    },
    reply: async (payload: ReplyBody) => {
      if (state.sent) return state.sent.edit(publicBody(payload) as never);
      return send(payload);
    },
    deferReply: async () => {
      state.deferred = true;
      if (message.channel.isTextBased() && "sendTyping" in message.channel) {
        await message.channel.sendTyping();
      }
    },
    editReply: async (payload: ReplyBody) => {
      if (!state.sent) return send(payload);
      const edited = await state.sent.edit(publicBody(payload) as never);
      state.sent = edited;
      state.replied = true;
      return edited;
    },
    fetchReply: async () => {
      if (!state.sent) throw new Error("Akira hasn't replied yet.");
      return state.sent;
    },
    deleteReply: async () => {
      await state.sent?.delete().catch(() => undefined);
      state.sent = null;
    },
    followUp: async (payload: ReplyBody) => send(payload),
  };

  return interaction as unknown as ChatInputCommandInteraction;
}
