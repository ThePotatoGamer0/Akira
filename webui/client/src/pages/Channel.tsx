import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { renderChatLog, type ChatLog, type RawMessage } from "../../../../modules/discord-log-html/src/index.js";
import "../../../../modules/discord-log-html/styles.css";
import { apiSocketUrl } from "../lib/api.js";
import { MediaViewer, type ViewMedia } from "../components/MediaViewer.js";
import { MessageBar } from "../components/channel/MessageBar.js";

type Payload = ChatLog & { hasMore?: boolean };
type LiveEvent = {
  type?: string;
  id?: string;
  message?: RawMessage;
};

function snowflakeAsc(a: string, b: string): number {
  try {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  } catch {
    return a < b ? -1 : a > b ? 1 : 0;
  }
}

function mergeById<T extends { id: string }>(current: T[] | undefined, extra: T[] | undefined): T[] {
  const map = new Map<string, T>();
  for (const item of current ?? []) map.set(item.id, item);
  for (const item of extra ?? []) map.set(item.id, item);
  return [...map.values()];
}

export function ChannelPage(props: { fetchApi: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [log, setLog] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [older, setOlder] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [viewer, setViewer] = useState<ViewMedia | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const holding = useRef(false);
  const olderLock = useRef(false);
  const armed = useRef(false);
  const acting = useRef(false);
  const logRef = useRef<Payload | null>(null);
  const queue = useRef<LiveEvent[]>([]);
  logRef.current = log;

  const applyLive = useCallback((event: LiveEvent) => {
    setLog((current) => {
      if (!current) return current;
      if (event.type === "delete" && event.id) {
        return { ...current, messages: (current.messages ?? []).filter((message) => message.id !== event.id) };
      }
      const message = event.message;
      if (!message || (event.type !== "message" && event.type !== "update")) return current;
      const messages = [...(current.messages ?? [])];
      const index = messages.findIndex((item) => item.id === message.id);
      if (index >= 0) {
        messages[index] = message;
      } else {
        const oldest = messages[0];
        if (oldest && snowflakeAsc(message.id, oldest.id) < 0 && current.hasMore) return current;
        messages.push(message);
        messages.sort((a, b) => snowflakeAsc(a.id, b.id));
      }
      return { ...current, messages };
    });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const res = await props.fetchApi("/channel");
    const json = (await res.json()) as { log?: Payload; error?: string };
    if (!res.ok || !json.log) {
      setLog(null);
      setError(json.error ?? "Akira couldn't read the drop channel.");
      return;
    }
    stick.current = true;
    setLog(json.log);
    const pending = queue.current.splice(0);
    for (const event of pending) applyLive(event);
  }, [applyLive, props.fetchApi]);

  const loadOlder = useCallback(async () => {
    const current = logRef.current;
    const oldest = current?.messages?.[0]?.id;
    if (!current?.hasMore || !oldest || olderLock.current) return;
    olderLock.current = true;
    setOlder(true);
    const res = await props.fetchApi(`/channel?before=${oldest}`);
    olderLock.current = false;
    setOlder(false);
    if (!res.ok) return;
    holdPlace();
    const json = (await res.json()) as { log?: Payload };
    const page = json.log?.messages ?? [];
    setLog((prev) => {
      if (!prev) return prev;
      const seen = new Set((prev.messages ?? []).map((message) => message.id));
      const added = page.filter((message) => !seen.has(message.id));
      if (added.length === 0) return { ...prev, hasMore: false };
      return {
        ...prev,
        hasMore: json.log?.hasMore === true,
        roles: mergeById(prev.roles, json.log?.roles),
        members: mergeById(prev.members, json.log?.members),
        channels: mergeById(prev.channels, json.log?.channels),
        messages: [...added, ...(prev.messages ?? [])].sort((a, b) => snowflakeAsc(a.id, b.id)),
      };
    });
  }, [props.fetchApi]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer = 0;
    let closed = false;
    const connect = () => {
      if (closed) return;
      socket = new WebSocket(apiSocketUrl("/channel/live"));
      socket.onmessage = (event) => {
        let payload: LiveEvent;
        try {
          payload = JSON.parse(String(event.data)) as LiveEvent;
        } catch {
          return;
        }
        if (!logRef.current) {
          queue.current.push(payload);
          return;
        }
        holdPlace();
        if (!stick.current && payload.type === "message") setUnseen((count) => count + 1);
        applyLive(payload);
      };
      socket.onclose = () => {
        if (!closed) timer = window.setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [applyLive]);

  useLayoutEffect(() => {
    const root = document.querySelector(".webui-root");
    root?.classList.add("channel-lock");
    document.body.classList.add("channel-lock");
    const viewport = window.visualViewport;
    const phone = window.matchMedia("(max-width: 700px)");
    const place = () => {
      if (!viewport || !phone.matches) {
        document.documentElement.style.removeProperty("--vv-height");
        document.documentElement.style.removeProperty("--vv-offset");
        return;
      }
      document.documentElement.style.setProperty("--vv-height", `${viewport.height}px`);
      document.documentElement.style.setProperty("--vv-offset", `${viewport.offsetTop}px`);
    };
    place();
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    phone.addEventListener("change", place);
    return () => {
      root?.classList.remove("channel-lock");
      document.body.classList.remove("channel-lock");
      document.documentElement.style.removeProperty("--vv-height");
      document.documentElement.style.removeProperty("--vv-offset");
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      phone.removeEventListener("change", place);
    };
  }, []);

  function readAnchor(el: HTMLElement): { id: string; offset: number } | null {
    const top = el.getBoundingClientRect().top;
    for (const node of el.querySelectorAll<HTMLElement>("[data-message-id]")) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= top + 4) continue;
      const id = node.dataset.messageId;
      if (id) return { id, offset: rect.top - top };
    }
    return null;
  }

  function holdPlace() {
    const el = scroller.current;
    if (!el || stick.current) {
      anchor.current = null;
      holding.current = false;
      return;
    }
    anchor.current = readAnchor(el);
    holding.current = anchor.current != null;
  }

  function restorePlace(el: HTMLElement) {
    const saved = anchor.current;
    if (!saved) {
      holding.current = false;
      return;
    }
    const node = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(saved.id)}"]`);
    if (!node) {
      holding.current = false;
      return;
    }
    const delta = node.getBoundingClientRect().top - el.getBoundingClientRect().top - saved.offset;
    if (Math.abs(delta) > 0.5) el.scrollTop += delta;
    holding.current = false;
  }

  const html = useMemo(
    () => (log ? renderChatLog(log, { channelHeader: false }) : ""),
    [log],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current) {
      el.scrollTop = el.scrollHeight;
      anchor.current = null;
      armed.current = true;
      return;
    }
    restorePlace(el);
  }, [html]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const pin = () => {
      if (stick.current) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      restorePlace(el);
    };
    el.addEventListener("load", pin, true);
    return () => el.removeEventListener("load", pin, true);
  }, [html]);

  async function act(body: { messageId: string; kind: "reaction" | "button" | "select"; emojiName?: string; customId?: string; values?: string[] }) {
    if (acting.current) return;
    acting.current = true;
    setNotice(null);
    try {
      const res = await props.fetchApi("/channel/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 204) return;
      const json = (await res.json()) as { notice?: string; error?: string };
      setNotice(json.notice ?? json.error ?? "Akira couldn't do that.");
    } catch {
      setNotice("Akira couldn't do that.");
    } finally {
      acting.current = false;
    }
  }

  const name = log?.channel?.name ? `# ${log.channel.name}` : "Channel";

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onChange = (event: Event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement) || !select.classList.contains("dlog-select")) return;
      const message = select.closest("[data-message-id]");
      const messageId = message instanceof HTMLElement ? message.dataset.messageId : "";
      const customId = select.dataset.customId;
      const value = select.value;
      select.value = "";
      if (!messageId || !customId || !value) return;
      void act({ messageId, kind: "select", customId, values: [value] });
    };
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  });

  return (
    <div className="channel-page">
      <div className="channel-bar">
        <span className="channel-name">{name}</span>
      </div>
      <div
        className="channel-scroll"
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (!el || holding.current) return;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (stick.current) {
            setUnseen(0);
            anchor.current = null;
          } else {
            anchor.current = readAnchor(el);
          }
          if (armed.current && el.scrollTop < 240) void loadOlder();
        }}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          const view = target.closest("button.dlog-view");
          if (view instanceof HTMLButtonElement && view.dataset.src) {
            setViewer({
              src: view.dataset.src,
              name: view.dataset.name ?? "",
              avatar: view.dataset.avatar ?? "",
              app: view.dataset.app === "1",
              time: view.dataset.time ?? "",
              color: view.dataset.color ?? "",
            });
            return;
          }
          const control = target.closest("button.dlog-reaction, button.dlog-action");
          if (!(control instanceof HTMLButtonElement) || control.disabled) return;
          const message = control.closest("[data-message-id]");
          const messageId = message instanceof HTMLElement ? message.dataset.messageId : "";
          if (!messageId) return;
          if (control.dataset.emojiName) {
            void act({ messageId, kind: "reaction", emojiName: control.dataset.emojiName });
            return;
          }
          if (control.dataset.customId) {
            void act({ messageId, kind: "button", customId: control.dataset.customId });
          }
        }}
      >
        {error ? (
          <p className="webui-alert" role="alert">
            {error}
          </p>
        ) : null}
        {html ? <div className="channel-log" dangerouslySetInnerHTML={{ __html: html }} /> : null}
      </div>
      {notice ? <p className="channel-note" role="status">{notice}</p> : null}
      <MessageBar channelName={log?.channel?.name ?? "channel"} fetchApi={props.fetchApi} />
      {older ? <p className="channel-older">Loading earlier messages…</p> : null}
      {unseen > 0 ? (
        <button
          type="button"
          className="channel-jump"
          onClick={() => {
            stick.current = true;
            setUnseen(0);
            const el = scroller.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          New messages
        </button>
      ) : null}
      {viewer ? <MediaViewer media={viewer} onClose={() => setViewer(null)} /> : null}
    </div>
  );
}
