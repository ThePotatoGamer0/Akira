import { useEffect, useId, useRef, useState } from "react";
import { discordEmojiUrl } from "../../../../../modules/discord-log-html/src/emoji.js";

type FetchApi = (path: string, init?: RequestInit) => Promise<Response>;
type Panel = "stamp" | "emoji" | "gif" | "sticker" | null;
type StampStyle = "" | "t" | "T" | "d" | "D" | "f" | "F";

type GuildEmoji = { id: string; name: string; animated: boolean };
type GuildSticker = { id: string; name: string; url: string };
type GifHit = { id: string; name: string; url: string; preview: string };

type Draft =
  | { key: string; kind: "file"; name: string; url: string; file: File }
  | { key: string; kind: "gif"; name: string; url: string; preview: string }
  | { key: string; kind: "sticker"; name: string; url: string };

const STAMP_STYLES: StampStyle[] = ["", "t", "T", "d", "D", "f", "F"];

const EMOJI_GROUPS: Array<{ name: string; emoji: string[] }> = [
  {
    name: "Smileys",
    emoji: ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊", "😋", "😎", "😍", "😘", "🥰", "😗", "😙", "😚", "🙂", "🤗", "🤩", "🤔", "🤨", "😐", "😑", "😶", "🙄", "😏", "😣", "😥", "😮", "🤐", "😯", "😪", "😫", "🥱", "😴", "😌", "😛", "😜", "😝", "🤤", "😒", "😓", "😔", "😕", "🙃", "🤑", "😲", "☹️", "🙁", "😖", "😞", "😟", "😤", "😢", "😭", "😦", "😧", "😨", "😩", "🤯", "😬", "😰", "😱", "🥵", "🥶", "😳", "🤪", "😵", "🥴", "😠", "😡", "🤬", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "😇", "🥳", "🥺", "🤠", "🤡", "🤥", "🤫", "🤭", "🧐", "🤓"],
  },
  {
    name: "People",
    emoji: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "💪", "👀", "👁️", "👅", "👄"],
  },
  {
    name: "Nature",
    emoji: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦄", "🐝", "🐛", "🦋", "🌸", "🌹", "🌺", "🌻", "🌼", "🌷", "🌱", "🌲", "🌳", "🍀", "🍁", "🍂"],
  },
  {
    name: "Food",
    emoji: ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🍆", "🥔", "🥕", "🌽", "🌶️", "🫑", "🥒", "🥬", "🥦", "🍞", "🥐", "🧀", "🍗", "🍔", "🍟", "🍕", "🌭", "🥪", "🌮", "🍣", "🍪", "🎂", "🍰", "☕", "🍵", "🧋"],
  },
  {
    name: "Activities",
    emoji: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥊", "🎮", "🕹️", "🎲", "🧩", "🎯", "🎨", "🎭", "🎤", "🎧", "🎼", "🎹", "🥁", "🎷", "🎺", "🎸"],
  },
  {
    name: "Travel",
    emoji: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚", "🚛", "🚜", "🛵", "🚲", "✈️", "🚀", "🛸", "🚁", "⛵", "🚢", "🏠", "🏡", "🏢", "🏥", "🏦", "🏰", "🗼", "🗽", "⛲", "🌃", "🌄", "🌈", "⭐", "🌟"],
  },
  {
    name: "Objects",
    emoji: ["⌚", "📱", "💻", "⌨️", "🖥️", "🖨️", "📷", "📸", "🎥", "📺", "📻", "🎙️", "⏰", "⌛", "💡", "🔦", "🕯️", "💰", "💳", "💎", "🔧", "🔨", "🔩", "🔫", "💣", "🔑", "🗝️", "🎁", "🎀", "🎈", "🎉", "✉️", "📦", "📫", "📝", "📚", "📖", "🔖", "📌"],
  },
  {
    name: "Symbols",
    emoji: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💯", "✅", "❌", "⭕", "❗", "❓", "‼️", "⁉️", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🔶", "🔷", "🔺", "🔻"],
  },
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatStamp(date: Date, style: StampStyle): string {
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  const timeSec = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  const shortDate = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  const longDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(date);
  const fullDate = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  if (style === "t") return time;
  if (style === "T") return timeSec;
  if (style === "d") return shortDate;
  if (style === "D") return longDate;
  if (style === "F") return `${fullDate} at ${time}`;
  return `${longDate} at ${time}`;
}

function stampCode(date: Date, style: StampStyle): string {
  const unix = Math.floor(date.getTime() / 1000);
  return style ? `<t:${unix}:${style}>` : `<t:${unix}>`;
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fieldValue(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSticker() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M6 4.5h8.2L19.5 9.8V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V6A1.5 1.5 0 0 1 6 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 4.8V9.5h4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="10" cy="13" r="0.8" fill="currentColor" />
      <circle cx="14.2" cy="13" r="0.8" fill="currentColor" />
      <path d="M9.4 15.6c.7.8 1.6 1.2 2.7 1.2s2-.4 2.7-1.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconEmoji() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9.2" cy="10.2" r="0.9" fill="currentColor" />
      <circle cx="14.8" cy="10.2" r="0.9" fill="currentColor" />
      <path d="M8.8 13.6c.8 1.3 1.9 2 3.2 2s2.4-.7 3.2-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function MessageBar(props: { channelName: string; fetchApi: FetchApi }) {
  const fileId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Draft[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [openedAt] = useState(() => new Date());
  const [picked, setPicked] = useState<Date | null>(null);
  const [style, setStyle] = useState<StampStyle>("");
  const [formatOpen, setFormatOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [guildEmoji, setGuildEmoji] = useState<GuildEmoji[]>([]);
  const [stickers, setStickers] = useState<GuildSticker[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<GifHit[]>([]);
  const [gifNote, setGifNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const when = picked ?? openedAt;

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    if (panel !== "emoji" && panel !== "sticker") return;
    if (assetsLoaded) return;
    let cancelled = false;
    void props.fetchApi("/channel/composer").then(async (res) => {
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { emojis?: GuildEmoji[]; stickers?: GuildSticker[] };
      if (cancelled) return;
      setGuildEmoji(json.emojis ?? []);
      setStickers(json.stickers ?? []);
      setAssetsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [assetsLoaded, panel, props.fetchApi]);

  useEffect(() => {
    if (panel !== "gif") return;
    const q = gifQuery.trim();
    const timer = window.setTimeout(() => {
      void props.fetchApi(`/channel/gifs?q=${encodeURIComponent(q)}`).then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { gifs?: GifHit[]; unavailable?: boolean };
        setGifs(json.gifs ?? []);
        setGifNote(json.unavailable ? "GIF search isn't set up on this server yet." : null);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [gifQuery, panel, props.fetchApi]);

  useEffect(() => {
    if (!panel || panel === "stamp") return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setPanel(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  function insert(token: string) {
    const el = area.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? start;
    const next = `${draft.slice(0, start)}${token}${draft.slice(end)}`;
    setDraft(next);
    const pos = start + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Draft[] = [];
    for (const file of list) {
      next.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        kind: "file",
        name: file.name,
        url: URL.createObjectURL(file),
        file,
      });
    }
    setFiles((current) => [...current, ...next].slice(0, 10));
  }

  function removeFile(key: string) {
    setFiles((current) => {
      const found = current.find((item) => item.key === key);
      if (found?.kind === "file") URL.revokeObjectURL(found.url);
      return current.filter((item) => item.key !== key);
    });
  }

  async function send() {
    if (sending) return;
    if (!draft.trim() && files.length === 0) return;
    if (files.some((item) => item.kind === "file" && item.file.size > 8 * 1024 * 1024)) {
      setSendError("Akira can take files up to 8 MB.");
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const uploads = await Promise.all(
        files.filter((item) => item.kind === "file").map(async (item) => ({
          name: item.name,
          data: await fileToBase64(item.file),
        })),
      );
      const res = await props.fetchApi("/channel/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draft,
          files: uploads,
          gifUrls: files.filter((item) => item.kind === "gif").map((item) => item.url),
          stickerIds: files.filter((item) => item.kind === "sticker").map((item) => item.key),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setSendError(json?.error ?? "Akira couldn't send that.");
        setSending(false);
        return;
      }
      for (const item of files) {
        if (item.kind === "file") URL.revokeObjectURL(item.url);
      }
      setDraft("");
      setFiles([]);
      setPanel(null);
      setSending(false);
    } catch {
      setSendError("Akira couldn't send that.");
      setSending(false);
    }
  }

  const placeholder = `Message #${props.channelName.replace(/^#/, "")}`;
  const emojiNeedle = emojiQuery.trim().toLowerCase();
  const filteredEmoji = EMOJI_GROUPS.map((group) => ({
    name: group.name,
    emoji: emojiNeedle ? group.emoji.filter((item) => item.includes(emojiNeedle)) : group.emoji,
  })).filter((group) => group.emoji.length > 0);
  const filteredGuild = guildEmoji.filter((item) => !emojiNeedle || item.name.toLowerCase().includes(emojiNeedle));

  return (
    <div className={sending ? "composer is-sending" : "composer"} ref={root}>
      {files.length > 0 ? (
        <div className="composer-files">
          {files.map((file) => {
            const thumb = file.kind === "gif" ? file.preview : file.kind === "file" && !/\.(png|jpe?g|gif|webp|avif)$/i.test(file.name) ? "" : file.url;
            return (
            <div className="composer-file" key={file.key}>
              {thumb ? <img src={thumb} alt="" /> : null}
              <span>{file.name}</span>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(file.key)}>
                <IconClose />
              </button>
            </div>
            );
          })}
        </div>
      ) : null}
      {sendError ? <p className="composer-error">{sendError}</p> : null}
      <div className="composer-row">
        <label className="composer-plus" htmlFor={fileId} aria-label="Upload a file">
          <IconPlus />
          <input
            id={fileId}
            type="file"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <textarea
          ref={area}
          rows={1}
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-tools">
          <button type="button" className={panel === "stamp" ? "is-on" : ""} aria-label="Insert timestamp" onClick={() => setPanel(panel === "stamp" ? null : "stamp")}>
            <IconCalendar />
          </button>
          <button type="button" className={panel === "gif" ? "composer-gif is-on" : "composer-gif"} aria-label="Open GIF picker" onClick={() => setPanel(panel === "gif" ? null : "gif")}>
            GIF
          </button>
          <button type="button" className={panel === "sticker" ? "is-on" : ""} aria-label="Open sticker picker" onClick={() => setPanel(panel === "sticker" ? null : "sticker")}>
            <IconSticker />
          </button>
          <button type="button" className={panel === "emoji" ? "is-on" : ""} aria-label="Open emoji picker" onClick={() => setPanel(panel === "emoji" ? null : "emoji")}>
            <IconEmoji />
          </button>
        </div>
      </div>

      {panel === "emoji" ? (
        <div className="composer-pop" role="dialog" aria-label="Emoji">
          <input value={emojiQuery} onChange={(event) => setEmojiQuery(event.target.value)} placeholder="Search emoji" aria-label="Search emoji" />
          <div className="composer-pop-scroll">
            {filteredGuild.length > 0 ? (
              <section>
                <h3>Server</h3>
                <div className="composer-emoji-grid">
                  {filteredGuild.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-label={item.name}
                      onClick={() => {
                        insert(item.animated ? `<a:${item.name}:${item.id}>` : `<:${item.name}:${item.id}>`);
                        setPanel(null);
                      }}
                    >
                      <img src={`https://cdn.discordapp.com/emojis/${item.id}.${item.animated ? "gif" : "webp"}?size=48&quality=lossless`} alt="" />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {filteredEmoji.map((group) => (
              <section key={group.name}>
                <h3>{group.name}</h3>
                <div className="composer-emoji-grid">
                  {group.emoji.map((item) => {
                    const src = discordEmojiUrl(item);
                    return (
                      <button
                        type="button"
                        key={item}
                        aria-label={item}
                        onClick={() => {
                          insert(item);
                          setPanel(null);
                        }}
                      >
                        {src ? <img src={src} alt="" /> : item}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      {panel === "sticker" ? (
        <div className="composer-pop" role="dialog" aria-label="Stickers">
          <div className="composer-pop-scroll">
            {stickers.length === 0 ? <p className="composer-empty">This server has no stickers yet.</p> : null}
            <div className="composer-sticker-grid">
              {stickers.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-label={item.name}
                  onClick={() => {
                    setFiles((current) => [
                      ...current.filter((file) => file.kind !== "sticker"),
                      { key: item.id, kind: "sticker", name: item.name, url: item.url },
                    ]);
                    setPanel(null);
                  }}
                >
                  <img src={item.url} alt="" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {panel === "gif" ? (
        <div className="composer-pop" role="dialog" aria-label="GIFs">
          <input value={gifQuery} onChange={(event) => setGifQuery(event.target.value)} placeholder="Search GIPHY" aria-label="Search GIPHY" />
          <p className="composer-gif-credit">
            <a href="https://giphy.com/" target="_blank" rel="noreferrer">Powered by GIPHY</a>
          </p>
          <div className="composer-pop-scroll">
            {gifNote ? <p className="composer-empty">{gifNote}</p> : null}
            <div className="composer-gif-grid">
              {gifs.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-label={item.name}
                  onClick={() => {
                    const next: Draft = { key: item.id, kind: "gif", name: item.name, url: item.url, preview: item.preview };
                    setFiles((current) => [...current, next].slice(0, 10));
                    setPanel(null);
                  }}
                >
                  <img src={item.preview} alt="" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {panel === "stamp" ? (
        <div className="stamp-backdrop" onClick={() => setPanel(null)}>
          <div className="stamp-modal" role="dialog" aria-modal="true" aria-label="Timestamp picker" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Timestamp Picker</h2>
              <button type="button" aria-label="Close" onClick={() => setPanel(null)}>
                <IconClose />
              </button>
            </header>
            <div className="stamp-date">
              <span className={picked ? "" : "is-placeholder"}>{picked ? fieldValue(picked) : "dd/mm/yyyy, --:--"}</span>
              <button
                type="button"
                aria-label="Choose date"
                onClick={() => {
                  const input = dateInput.current;
                  if (!input) return;
                  try {
                    input.showPicker();
                  } catch {
                    input.click();
                  }
                }}
              >
                <IconCalendar />
              </button>
              <input
                ref={dateInput}
                type="datetime-local"
                tabIndex={-1}
                value={localInputValue(when)}
                onChange={(event) => {
                  const next = new Date(event.target.value);
                  if (!Number.isNaN(next.getTime())) setPicked(next);
                }}
              />
            </div>
            <label className="stamp-label" htmlFor="stamp-format">
              Timestamp Format
            </label>
            <div className="stamp-format">
              <button id="stamp-format" type="button" aria-expanded={formatOpen} onClick={() => setFormatOpen((open) => !open)}>
                <span>{formatStamp(when, style)}</span>
                <span className="stamp-chevron" aria-hidden="true">
                  {formatOpen ? "⌃" : "⌄"}
                </span>
              </button>
              {formatOpen ? (
                <ul role="listbox">
                  {STAMP_STYLES.map((item) => (
                    <li key={item || "default"}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={item === style}
                        onClick={() => {
                          setStyle(item);
                          setFormatOpen(false);
                        }}
                      >
                        <span>{formatStamp(when, item)}</span>
                        {item === style ? <span className="stamp-check" aria-hidden="true">✓</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <p className="stamp-label">Preview</p>
            <p className="stamp-preview">
              <span>{formatStamp(when, style)}</span> ({stampCode(when, style)})
            </p>
            <button
              type="button"
              className="stamp-insert"
              onClick={() => {
                insert(stampCode(when, style));
                setPanel(null);
                setFormatOpen(false);
              }}
            >
              Insert
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
