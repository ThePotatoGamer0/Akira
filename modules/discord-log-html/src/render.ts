import { authorColor, displayName, escapeAttr, escapeHtml, renderContent, renderInline, roleInk, safeHttpUrl, type InlineContext } from "./markdown.js";
import type { ChatLog, RawAttachment, RawComponent, RawEmbed, RawEmoji, RawMessage } from "./types.js";

const SUPPRESS_EMBEDS = 1 << 2;

function avatarUrl(author: NonNullable<RawMessage["author"]>): string {
  if (author.avatar && /^\d+$/.test(author.id) && /^[a-zA-Z0-9_]+$/.test(author.avatar)) {
    const ext = author.avatar.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${ext}?size=80`;
  }
  let index = 0;
  if (author.discriminator && author.discriminator !== "0") {
    const parsed = Number(author.discriminator);
    if (Number.isFinite(parsed)) index = parsed % 5;
  } else {
    try {
      index = Number((BigInt(author.id) >> 22n) % 6n);
    } catch {
      index = 0;
    }
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function emojiImg(emoji: RawEmoji | null | undefined, jumbo = false): string {
  if (!emoji?.name && !emoji?.id) return "";
  if (emoji.id && /^\d+$/.test(emoji.id)) {
    const ext = emoji.animated ? "gif" : "webp";
    const alt = escapeAttr(emoji.name ?? "emoji");
    const className = jumbo ? "dlog-emoji dlog-emoji-jumbo" : "dlog-emoji";
    return `<img class="${className}" src="https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?size=48&amp;quality=lossless" alt=":${alt}:">`;
  }
  return `<span class="${jumbo ? "dlog-emoji-jumbo" : ""}">${escapeHtml(emoji.name ?? "")}</span>`;
}

function attachmentUrl(file: RawAttachment): string | null {
  return safeHttpUrl(file.proxy_url || file.url || "");
}

function attachmentName(file: RawAttachment): string {
  return file.filename || file.name || "file";
}

function isSpoiler(file: RawAttachment): boolean {
  return file.spoiler === true || attachmentName(file).startsWith("SPOILER_");
}

function fileKind(file: RawAttachment, url: string): "image" | "video" | "audio" | "file" {
  const type = file.content_type ?? "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(png|jpe?g|gif|webp|avif|bmp)$/.test(path)) return "image";
  if (/\.(mp4|webm|mov)$/.test(path)) return "video";
  if (/\.(mp3|ogg|wav|m4a)$/.test(path)) return "audio";
  return "file";
}

function formatBytes(size: number | undefined): string {
  if (size == null || !Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function wrapSpoiler(html: string, spoiler: boolean): string {
  if (!spoiler) return html;
  return `<details class="dlog-spoiler-block"><summary>Spoiler</summary>${html}</details>`;
}

function renderAttachment(file: RawAttachment): string {
  const url = attachmentUrl(file);
  const name = escapeHtml(attachmentName(file));
  if (!url) return `<div class="dlog-file">${name}</div>`;
  const kind = fileKind(file, url);
  const src = escapeAttr(url);
  let body = "";
  if (kind === "image") body = `<a class="dlog-media-link" href="${src}" target="_blank" rel="noreferrer noopener"><img class="dlog-attachment-image" src="${src}" alt="${name}" loading="lazy"></a>`;
  else if (kind === "video") body = `<video class="dlog-video" src="${src}" controls playsinline></video>`;
  else if (kind === "audio") body = `<audio class="dlog-audio" src="${src}" controls></audio>`;
  else {
    const size = formatBytes(file.size);
    body = `<a class="dlog-file" href="${src}" target="_blank" rel="noreferrer noopener"><span>${name}</span>${size ? `<span class="dlog-file-size">${size}</span>` : ""}</a>`;
  }
  return wrapSpoiler(body, isSpoiler(file));
}

function sameResource(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.hostname === right.hostname && left.pathname === right.pathname;
  } catch {
    return false;
  }
}

function embedMedia(embed: RawEmbed): string {
  return embed.url || embed.image?.url || embed.image?.proxy_url || embed.video?.url || embed.video?.proxy_url || "";
}

function bareMediaEmbed(embed: RawEmbed, media: Set<string>): boolean {
  if (embed.title || embed.description || embed.author || embed.footer || (embed.fields && embed.fields.length > 0)) return false;
  const url = embedMedia(embed);
  if (!url) return false;
  for (const item of media) {
    if (sameResource(item, url)) return true;
  }
  return false;
}

function embedFooterTime(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `<time datetime="${escapeAttr(date.toISOString())}">${escapeHtml(date.toLocaleString())}</time>`;
}

function renderEmbed(embed: RawEmbed, ctx: InlineContext): string {
  const color = roleInk(embed.color) ?? "#202225";
  const thumb = safeHttpUrl(embed.thumbnail?.proxy_url || embed.thumbnail?.url || "");
  const image = safeHttpUrl(embed.image?.proxy_url || embed.image?.url || "");
  const video = safeHttpUrl(embed.video?.proxy_url || embed.video?.url || "");
  const authorIcon = safeHttpUrl(embed.author?.icon_url || "");
  const footerIcon = safeHttpUrl(embed.footer?.icon_url || "");
  const title = embed.title ? renderInline(embed.title, ctx) : "";
  const titleHtml = embed.url && safeHttpUrl(embed.url) && title
    ? `<a class="dlog-link" href="${escapeAttr(safeHttpUrl(embed.url) ?? "")}" target="_blank" rel="noreferrer noopener">${title}</a>`
    : title;
  const fields = (embed.fields ?? [])
    .map((field) => {
      const inline = field.inline ? " dlog-field-inline" : "";
      return `<div class="dlog-field${inline}"><div class="dlog-field-name">${renderInline(field.name ?? "", ctx)}</div><div class="dlog-field-value">${renderContent(field.value ?? "", ctx)}</div></div>`;
    })
    .join("");
  return `<article class="dlog-embed" style="--dlog-embed-color:${color}">
    <div class="dlog-embed-copy">
      ${embed.author?.name ? `<div class="dlog-embed-author">${authorIcon ? `<img src="${escapeAttr(authorIcon)}" alt="">` : ""}${escapeHtml(embed.author.name)}</div>` : ""}
      ${titleHtml ? `<div class="dlog-embed-title">${titleHtml}</div>` : ""}
      ${embed.description ? `<div class="dlog-embed-desc">${renderContent(embed.description, ctx)}</div>` : ""}
      ${fields ? `<div class="dlog-embed-fields">${fields}</div>` : ""}
      ${image ? `<img class="dlog-embed-image" src="${escapeAttr(image)}" alt="" loading="lazy">` : ""}
      ${video ? `<video class="dlog-video" src="${escapeAttr(video)}" controls playsinline loop muted></video>` : ""}
      ${embed.footer?.text || embed.timestamp ? `<div class="dlog-embed-footer">${footerIcon ? `<img src="${escapeAttr(footerIcon)}" alt="">` : ""}<span>${escapeHtml(embed.footer?.text ?? "")}</span>${embedFooterTime(embed.timestamp)}</div>` : ""}
    </div>
    ${thumb ? `<img class="dlog-embed-thumb" src="${escapeAttr(thumb)}" alt="" loading="lazy">` : ""}
  </article>`;
}

function renderReactions(message: RawMessage): string {
  const reactions = (message.reactions ?? []).filter((reaction) => (reaction.count ?? 0) > 0 && reaction.emoji);
  if (reactions.length === 0) return "";
  const buttons = reactions
    .map((reaction) => {
      const count = reaction.count ?? 0;
      const name = reaction.emoji?.name ?? "reaction";
      return `<button type="button" class="dlog-reaction" disabled aria-disabled="true" aria-label="${escapeAttr(name)} ${count}"><span class="dlog-reaction-emoji">${emojiImg(reaction.emoji)}</span><span class="dlog-reaction-count">${count}</span></button>`;
    })
    .join("");
  return `<div class="dlog-reactions">${buttons}</div>`;
}

function renderComponents(rows: RawComponent[] | undefined): string {
  if (!rows?.length) return "";
  const html = rows
    .map((row) => {
      const parts = (row.components ?? []).map((component) => {
        if (component.type === 3 || component.placeholder) {
          return `<div class="dlog-select" aria-disabled="true">${escapeHtml(component.placeholder || "Choose")}</div>`;
        }
        const label = `${component.emoji ? emojiImg(component.emoji) : ""}${component.label ? `<span>${escapeHtml(component.label)}</span>` : ""}`;
        const url = component.url ? safeHttpUrl(component.url) : null;
        if (url) return `<a class="dlog-action dlog-action-link" href="${escapeAttr(url)}" target="_blank" rel="noreferrer noopener">${label}</a>`;
        return `<button type="button" class="dlog-action" disabled aria-disabled="true">${label || "Button"}</button>`;
      });
      return `<div class="dlog-action-row">${parts.join("")}</div>`;
    })
    .join("");
  return html ? `<div class="dlog-components">${html}</div>` : "";
}

function stickerUrl(sticker: NonNullable<RawMessage["sticker_items"]>[number]): string | null {
  const given = sticker.url ? safeHttpUrl(sticker.url) : null;
  if (given) return given;
  if (!/^\d+$/.test(sticker.id)) return null;
  const ext = sticker.format_type === 4 ? "gif" : "png";
  return `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=160`;
}

function renderStickers(message: RawMessage): string {
  const stickers = message.sticker_items ?? [];
  if (stickers.length === 0) return "";
  const tags = stickers
    .map((sticker) => {
      const url = stickerUrl(sticker);
      if (!url) return "";
      return `<img class="dlog-sticker" src="${escapeAttr(url)}" alt="${escapeAttr(sticker.name ?? "sticker")}" loading="lazy">`;
    })
    .join("");
  return tags ? `<div class="dlog-stickers">${tags}</div>` : "";
}

function plainSnippet(message: RawMessage): string {
  const content = (message.content ?? "").replace(/<a?:(\w+):\d+>/g, ":$1:").replace(/<@!?(\d+)>/g, "@someone").replace(/<@&(\d+)>/g, "@role").replace(/<#(\d+)>/g, "#channel");
  const text = content.replace(/\s+/g, " ").trim();
  if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  if ((message.attachments ?? []).length > 0) return "Attachment";
  if ((message.embeds ?? []).length > 0) return "Embed";
  if ((message.sticker_items ?? []).length > 0) return message.sticker_items?.[0]?.name ?? "Sticker";
  return "Message";
}

function renderReply(message: RawMessage, log: ChatLog): string {
  const ref = message.referenced_message;
  if (!ref && !message.message_reference) return "";
  const name = ref ? displayName(ref.author, ref.member?.nick, log) : "someone";
  const text = ref ? plainSnippet(ref) : "Original message";
  const href = ref ? `#dlog-${ref.id}` : "";
  const inner = `<span class="dlog-reply-name">${escapeHtml(name)}</span><span class="dlog-reply-text">${escapeHtml(text)}</span>`;
  if (!href) return `<div class="dlog-reply">${inner}</div>`;
  return `<a class="dlog-reply" href="${escapeAttr(href)}">${inner}</a>`;
}

function onlyEmoji(content: string): boolean {
  const stripped = content
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u200d\ufe0f\s]/g, "");
  return content.trim().length > 0 && stripped.length === 0;
}

function renderMessage(message: RawMessage, log: ChatLog, grouped: boolean): string {
  const ctx: InlineContext = { log, media: new Set() };
  const author = message.author;
  const name = displayName(author, message.member?.nick, log);
  const roleIds = message.member?.roles ?? log.members?.find((member) => member.id === author?.id)?.roles;
  const color = authorColor(roleIds, log.roles);
  const when = message.timestamp ? new Date(message.timestamp) : null;
  const time = when && !Number.isNaN(when.getTime()) ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
  const content = renderContent(message.content ?? "", ctx);
  const jumbo = onlyEmoji(message.content ?? "") ? " dlog-jumbo" : "";
  const embeds = (message.flags ?? 0) & SUPPRESS_EMBEDS
    ? ""
    : (message.embeds ?? [])
        .filter((embed) => !bareMediaEmbed(embed, ctx.media))
        .map((embed) => renderEmbed(embed, ctx))
        .join("");
  const attachments = (message.attachments ?? []).map((file) => renderAttachment(file)).join("");
  const nameStyle = color ? ` style="color:${color}"` : "";
  const head = grouped
    ? ""
    : `<header class="dlog-meta"><span class="dlog-author"${nameStyle}>${escapeHtml(name)}</span>${author?.bot ? `<span class="dlog-bot">BOT</span>` : ""}${when ? `<time datetime="${when.toISOString()}">${escapeHtml(time)}</time>` : ""}${message.edited_timestamp ? `<span class="dlog-edited">(edited)</span>` : ""}</header>`;
  const avatar = grouped || !author
    ? `<span class="dlog-avatar-spacer" aria-hidden="true"></span>`
    : `<img class="dlog-avatar" src="${escapeAttr(avatarUrl(author))}" alt="">`;
  return `<article class="dlog-message${grouped ? " dlog-continued" : ""}" id="dlog-${escapeAttr(message.id)}">
    ${avatar}
    <div class="dlog-body">
      ${renderReply(message, log)}
      ${head}
      ${content ? `<div class="dlog-content${jumbo}">${content}</div>` : ""}
      ${attachments ? `<div class="dlog-attachments">${attachments}</div>` : ""}
      ${embeds ? `<div class="dlog-embeds">${embeds}</div>` : ""}
      ${renderStickers(message)}
      ${renderComponents(message.components)}
      ${renderReactions(message)}
    </div>
  </article>`;
}

function sameGroup(previous: RawMessage, current: RawMessage): boolean {
  if (!previous.author?.id || previous.author.id !== current.author?.id) return false;
  if (current.message_reference || current.referenced_message) return false;
  if ((current.type ?? 0) !== 0 && current.type !== 19) return false;
  if (!previous.timestamp || !current.timestamp) return false;
  const gap = new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime();
  if (!Number.isFinite(gap) || gap < 0 || gap > 7 * 60 * 1000) return false;
  const a = new Date(previous.timestamp);
  const b = new Date(current.timestamp);
  return a.toDateString() === b.toDateString();
}

function dayLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Render a Discord channel log to HTML.
 * Reactions and message buttons are present and disabled: the host cannot act as the account that sent them.
 */
export function renderChatLog(log: ChatLog, options?: { channelHeader?: boolean }): string {
  const messages = log.messages ?? [];
  if (messages.length === 0) {
    return `<div class="dlog"><p class="dlog-empty">Nothing has been said here yet.</p></div>`;
  }
  let html = "";
  let previous: RawMessage | null = null;
  let day = "";
  for (const message of messages) {
    const label = dayLabel(message.timestamp);
    if (label && label !== day) {
      day = label;
      html += `<div class="dlog-day"><span>${escapeHtml(label)}</span></div>`;
      previous = null;
    }
    const grouped = previous ? sameGroup(previous, message) : false;
    html += renderMessage(message, log, grouped);
    previous = message;
  }
  const name =
    options?.channelHeader === false || !log.channel?.name
      ? ""
      : `<div class="dlog-channel"># ${escapeHtml(log.channel.name)}</div>`;
  return `<div class="dlog">${name}${html}</div>`;
}
