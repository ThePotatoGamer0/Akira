/**
 * discord-log-html
 *
 * Pass the raw channel log a bot read from Discord (`ChatLog`) and get HTML back.
 * Include styles.css for embeds, images, GIFs, mentions, and reaction pills.
 * The host page can restyle anything under `.dlog` and the `--dlog-*` variables.
 */
export { discordEmojiUrl } from "./emoji.js";
export { renderChatLog } from "./render.js";
export type { ChatLog, ChatMember, ChatRole, RawMessage } from "./types.js";
