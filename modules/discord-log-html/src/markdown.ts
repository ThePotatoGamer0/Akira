import { discordEmojiImg, matchDiscordEmoji } from "./emoji.js";
import type { ChatLog, ChatMember, ChatRole, RawUser } from "./types.js";

export type MediaView = {
  name: string;
  avatar: string;
  app: boolean;
  time: string;
  color: string;
};

export type InlineContext = {
  log: ChatLog;
  media: Set<string>;
  view?: MediaView;
};

const MEDIA_MAX_W = 400;
const MEDIA_MAX_H = 300;

export function fitMedia(width?: number | null, height?: number | null): { width: number; height: number } | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const scale = Math.min(MEDIA_MAX_W / width, MEDIA_MAX_H / height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Image the host page can open in a viewer. Falls back to a plain img when no sender is known. */
export function viewableImage(options: {
  src: string;
  className: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
  ctx: InlineContext;
}): string {
  const fitted = fitMedia(options.width, options.height);
  const size = fitted
    ? ` width="${fitted.width}" height="${fitted.height}" style="width:${fitted.width}px;aspect-ratio:${fitted.width}/${fitted.height}"`
    : "";
  const img = `<img class="${options.className}" src="${escapeAttr(options.src)}" alt="${escapeAttr(options.alt ?? "")}"${size} loading="lazy">`;
  const view = options.ctx.view;
  if (!view) return img;
  return `<button type="button" class="dlog-view" data-src="${escapeAttr(options.src)}" data-name="${escapeAttr(view.name)}" data-avatar="${escapeAttr(view.avatar)}" data-app="${view.app ? "1" : "0"}" data-time="${escapeAttr(view.time)}" data-color="${escapeAttr(view.color)}">${img}</button>`;
}

const URL_TAIL = /[),.;!?\]>]+$/;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

export function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function mediaKind(url: string): "image" | "video" | null {
  const path = url.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".gif") || path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".webp") || path.endsWith(".avif") || path.endsWith(".bmp")) {
    return "image";
  }
  if (path.endsWith(".mp4") || path.endsWith(".webm") || path.endsWith(".mov")) return "video";
  return null;
}

function mediaTag(url: string, ctx: InlineContext): string {
  const kind = mediaKind(url);
  if (kind === "video") return `<video class="dlog-video" src="${escapeAttr(url)}" controls playsinline></video>`;
  return viewableImage({ src: url, className: "dlog-media", ctx });
}

function linkTag(url: string, label: string, ctx: InlineContext): string {
  const safe = safeHttpUrl(url);
  if (!safe) return escapeHtml(label);
  if (mediaKind(safe)) {
    ctx.media.add(safe);
    return mediaTag(safe, ctx);
  }
  return `<a class="dlog-link" href="${escapeAttr(safe)}" target="_blank" rel="noreferrer noopener">${label}</a>`;
}

function memberById(log: ChatLog, id: string): ChatMember | undefined {
  return log.members?.find((member) => member.id === id);
}

function roleById(log: ChatLog, id: string): ChatRole | undefined {
  return log.roles?.find((role) => role.id === id);
}

function userName(user: RawUser | undefined, member: ChatMember | undefined): string {
  return member?.display || user?.global_name || user?.username || "someone";
}

export function roleInk(color: number | undefined): string | null {
  if (color == null || !Number.isFinite(color) || color <= 0) return null;
  const hex = (color >>> 0) & 0xffffff;
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function mentionUser(id: string, ctx: InlineContext): string {
  const listed = ctx.log.messages
    ?.flatMap((message) => message.mentions ?? [])
    .find((user) => user.id === id);
  const author = ctx.log.messages?.find((message) => message.author?.id === id)?.author;
  const user = listed ?? author;
  const member = memberById(ctx.log, id);
  const name = userName(user, member);
  const color = roleInk(topRole(member?.roles, ctx.log.roles)?.color);
  const style = color ? ` style="--dlog-mention-bg:${color};--dlog-mention-ink:${color}"` : "";
  return `<span class="dlog-mention dlog-mention-user"${style}>@${escapeHtml(name)}</span>`;
}

function topRole(ids: string[] | undefined, roles: ChatRole[] | undefined): ChatRole | undefined {
  if (!ids?.length || !roles?.length) return undefined;
  let best: ChatRole | undefined;
  for (const id of ids) {
    const role = roles.find((item) => item.id === id);
    if (!role?.color) continue;
    if (!best || (role.position ?? 0) > (best.position ?? 0)) best = role;
  }
  return best;
}

function mentionRole(id: string, ctx: InlineContext): string {
  const role = roleById(ctx.log, id);
  const name = role?.name ?? "deleted-role";
  const color = roleInk(role?.color);
  const style = color ? ` style="--dlog-role:${color}"` : "";
  return `<span class="dlog-mention dlog-mention-role"${style}>@${escapeHtml(name)}</span>`;
}

function customEmoji(animated: boolean, name: string, id: string): string {
  if (!/^\d+$/.test(id)) return escapeHtml(`:${name}:`);
  const ext = animated ? "gif" : "webp";
  const alt = escapeAttr(name || "emoji");
  return `<img class="dlog-emoji" src="https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&amp;quality=lossless" alt=":${alt}:">`;
}

function timestampTag(unix: number, style: string): string {
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const text =
    style === "R"
      ? relativeTime(date)
      : date.toLocaleString(undefined, timestampOptions(style));
  return `<time class="dlog-timestamp" datetime="${date.toISOString()}">${escapeHtml(text)}</time>`;
}

function timestampOptions(style: string): Intl.DateTimeFormatOptions {
  if (style === "t") return { hour: "numeric", minute: "2-digit" };
  if (style === "T") return { hour: "numeric", minute: "2-digit", second: "2-digit" };
  if (style === "d") return { day: "numeric", month: "numeric", year: "numeric" };
  if (style === "D") return { day: "numeric", month: "long", year: "numeric" };
  if (style === "F") return { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" };
  return { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" };
}

function relativeTime(date: Date): string {
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  const abs = Math.abs(minutes);
  const suffix = minutes >= 0 ? "from now" : "ago";
  if (abs < 1) return "now";
  if (abs < 60) return `${abs} minute${abs === 1 ? "" : "s"} ${suffix}`;
  const hours = Math.round(abs / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ${suffix}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ${suffix}`;
}

function matchWrap(input: string, i: number, marker: string): { inner: string; end: number } | null {
  if (!input.startsWith(marker, i)) return null;
  if (marker.startsWith("_")) {
    const prev = i === 0 ? "" : (input[i - 1] ?? "");
    if (prev && !/[\s([{"']/.test(prev)) return null;
  }
  const after = i + marker.length;
  if (after >= input.length || input[after] === " " || input[after] === "\n") return null;
  let search = after;
  while (search < input.length) {
    const end = input.indexOf(marker, search);
    if (end === -1) return null;
    const before = input[end - 1] ?? "";
    if (before !== " " && before !== "\n" && end > after) {
      return { inner: input.slice(after, end), end: end + marker.length };
    }
    search = end + marker.length;
  }
  return null;
}

function matchUrl(input: string, i: number): { raw: string; end: number } | null {
  if (!input.startsWith("http://", i) && !input.startsWith("https://", i)) return null;
  let end = i;
  while (end < input.length && !/\s/.test(input[end] ?? "")) end++;
  let raw = input.slice(i, end).replace(URL_TAIL, "");
  if (!safeHttpUrl(raw)) return null;
  return { raw, end: i + raw.length };
}

/** Discord markdown, mentions, custom emoji, and media links for one block of text. */
export function renderInline(input: string, ctx: InlineContext): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i] ?? "";
    if (ch === "\\" && i + 1 < input.length) {
      out += escapeHtml(input[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = input.indexOf("`", i + 1);
      if (end !== -1) {
        out += `<code class="dlog-code">${escapeHtml(input.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }
    if (ch === "<") {
      const emoji = /^<a?:(\w+):(\d+)>/.exec(input.slice(i));
      if (emoji) {
        out += customEmoji(input.startsWith("<a:", i), emoji[1] ?? "", emoji[2] ?? "");
        i += emoji[0].length;
        continue;
      }
      const role = /^<@&(\d+)>/.exec(input.slice(i));
      if (role) {
        out += mentionRole(role[1] ?? "", ctx);
        i += role[0].length;
        continue;
      }
      const user = /^<@!?(\d+)>/.exec(input.slice(i));
      if (user) {
        out += mentionUser(user[1] ?? "", ctx);
        i += user[0].length;
        continue;
      }
      const channel = /^<#(\d+)>/.exec(input.slice(i));
      if (channel) {
        const name = ctx.log.channels?.find((item) => item.id === channel[1])?.name ?? "channel";
        out += `<span class="dlog-mention dlog-mention-channel">#${escapeHtml(name)}</span>`;
        i += channel[0].length;
        continue;
      }
      const stamp = /^<t:(-?\d+)(?::([tTdDfFR]))?>/.exec(input.slice(i));
      if (stamp) {
        out += timestampTag(Number(stamp[1]), stamp[2] ?? "f");
        i += stamp[0].length;
        continue;
      }
      const command = /^<\/([\w -]+):\d+>/.exec(input.slice(i));
      if (command) {
        out += `<span class="dlog-mention dlog-mention-command">/${escapeHtml(command[1] ?? "")}</span>`;
        i += command[0].length;
        continue;
      }
      const bracketUrl = /^<(https?:\/\/[^>\s]+)>/.exec(input.slice(i));
      if (bracketUrl?.[1] && safeHttpUrl(bracketUrl[1])) {
        out += linkTag(bracketUrl[1], escapeHtml(bracketUrl[1]), ctx);
        i += bracketUrl[0].length;
        continue;
      }
    }
    const url = matchUrl(input, i);
    if (url) {
      out += linkTag(url.raw, escapeHtml(url.raw), ctx);
      i = url.end;
      continue;
    }
    const masked = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(input.slice(i));
    if (masked?.[1] && masked[2] && safeHttpUrl(masked[2])) {
      out += linkTag(masked[2], renderInline(masked[1], ctx), ctx);
      i += masked[0].length;
      continue;
    }
    if (input.startsWith("@everyone", i) || input.startsWith("@here", i)) {
      const prev = i === 0 ? "" : (input[i - 1] ?? "");
      const word = input.startsWith("@everyone", i) ? "@everyone" : "@here";
      if (!prev || /[\s]/.test(prev)) {
        out += `<span class="dlog-mention">${word}</span>`;
        i += word.length;
        continue;
      }
    }
    const wraps: Array<[string, string]> = [
      ["***", "both"],
      ["**", "strong"],
      ["__", "underline"],
      ["~~", "strike"],
      ["||", "spoiler"],
      ["*", "em"],
      ["_", "em"],
    ];
    let wrapped = false;
    for (const [marker, kind] of wraps) {
      const hit = matchWrap(input, i, marker);
      if (!hit) continue;
      const inner = renderInline(hit.inner, ctx);
      if (kind === "both") out += `<strong><em>${inner}</em></strong>`;
      else if (kind === "strong") out += `<strong>${inner}</strong>`;
      else if (kind === "underline") out += `<u>${inner}</u>`;
      else if (kind === "strike") out += `<s>${inner}</s>`;
      else if (kind === "spoiler") out += `<label class="dlog-spoiler"><input type="checkbox" tabindex="-1"><span>${inner}</span></label>`;
      else out += `<em>${inner}</em>`;
      i = hit.end;
      wrapped = true;
      break;
    }
    if (wrapped) continue;
    const emoji = matchDiscordEmoji(input.slice(i));
    if (emoji) {
      out += discordEmojiImg(emoji, "dlog-emoji");
      i += emoji.length;
      continue;
    }
    out += escapeHtml(ch);
    i++;
  }
  return out;
}

/** Block structure: code fences, quotes, headings, lists, then inline markdown. */
export function renderContent(content: string, ctx: InlineContext): string {
  if (!content) return "";
  const lines = content.split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim().toLowerCase().replace(/[^a-z0-9_+-]/g, "");
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++;
      const className = lang ? ` class="dlog-lang-${escapeAttr(lang)}"` : "";
      blocks.push(`<pre class="dlog-codeblock"><code${className}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (line.startsWith(">>>")) {
      const rest = line.slice(line.startsWith(">>> ") ? 4 : 3);
      const quoted = [rest, ...lines.slice(i + 1)].join("\n");
      blocks.push(`<blockquote class="dlog-quote">${renderContent(quoted, ctx)}</blockquote>`);
      break;
    }
    if (line.startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        const current = lines[i] ?? "";
        quoted.push(current.startsWith("> ") ? current.slice(2) : current.slice(1));
        i++;
      }
      blocks.push(`<blockquote class="dlog-quote">${renderContent(quoted.join("\n"), ctx)}</blockquote>`);
      continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^(\s*)([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      blocks.push(`<${tag} class="dlog-list">${items.map((item) => `<li>${renderInline(item, ctx)}</li>`).join("")}</${tag}>`);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading?.[1] && heading[2]) {
      blocks.push(`<p class="dlog-h dlog-h${heading[1].length}">${renderInline(heading[2], ctx)}</p>`);
      i++;
      continue;
    }
    if (line.startsWith("-# ")) {
      blocks.push(`<p class="dlog-subtext">${renderInline(line.slice(3), ctx)}</p>`);
      i++;
      continue;
    }
    if (line.trim() === "") {
      blocks.push(`<div class="dlog-gap"></div>`);
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (
        current.trim() === "" ||
        current.startsWith("```") ||
        current.startsWith(">") ||
        /^(#{1,3})\s+/.test(current) ||
        current.startsWith("-# ") ||
        /^(\s*)([-*]|\d+\.)\s+/.test(current)
      ) {
        break;
      }
      para.push(current);
      i++;
    }
    blocks.push(`<p class="dlog-p">${para.map((part) => renderInline(part, ctx)).join("<br>")}</p>`);
  }
  return blocks.join("");
}

export function displayName(messageAuthor: RawUser | undefined, nick: string | null | undefined, log: ChatLog): string {
  if (nick) return nick;
  const member = messageAuthor ? memberById(log, messageAuthor.id) : undefined;
  return userName(messageAuthor, member);
}

export function authorColor(roleIds: string[] | undefined, roles: ChatRole[] | undefined): string | null {
  return roleInk(topRole(roleIds, roles)?.color);
}
