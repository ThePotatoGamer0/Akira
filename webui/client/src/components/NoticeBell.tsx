import { useEffect, useRef, useState } from "react";

type Notice = {
  id: string;
  type: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NoticeBell(props: { fetchApi: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notice[]>([]);
  const known = useRef<Set<string> | null>(null);
  const host = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await props.fetchApi("/notices");
    if (!res.ok) return;
    const json = (await res.json()) as { notices?: Notice[] };
    const next = json.notices ?? [];
    setNotices(next);
    if (known.current === null) {
      known.current = new Set(next.map((notice) => notice.id));
      return;
    }
    const fresh = next.filter((notice) => !notice.readAt && !known.current!.has(notice.id));
    for (const notice of next) known.current.add(notice.id);
    if (fresh.length > 0) {
      setToasts((current) => [...fresh, ...current].slice(0, 3));
    }
  }

  useEffect(() => {
    void load();
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("focus", onFocus);
    };
  }, [props.fetchApi]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((current) => current.slice(0, -1)), 8000);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markOne(id: string) {
    const res = await props.fetchApi(`/notices/${id}/read`, { method: "POST" });
    if (!res.ok) return;
    const json = (await res.json()) as { notices?: Notice[] };
    setNotices(json.notices ?? []);
    setToasts((current) => current.filter((notice) => notice.id !== id));
  }

  async function markAll() {
    const res = await props.fetchApi("/notices/read", { method: "POST" });
    if (!res.ok) return;
    const json = (await res.json()) as { notices?: Notice[] };
    setNotices(json.notices ?? []);
    setToasts([]);
  }

  const unread = notices.filter((notice) => !notice.readAt).length;

  return (
    <>
      <div className="notice-bell-host" ref={host}>
        <button
          type="button"
          className="notice-bell"
          aria-label={unread > 0 ? `Notices, ${unread} new` : "Notices"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {unread > 0 ? <span className="notice-count">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
        {open ? (
          <div className="notice-panel" role="dialog" aria-label="Notices">
            <div className="notice-panel-head">
              <strong>Notices</strong>
              {unread > 0 ? (
                <button type="button" className="secondary" onClick={() => void markAll()}>
                  Clear
                </button>
              ) : null}
            </div>
            {notices.length === 0 ? (
              <p className="settings-hint">Nothing yet. Akira leaves a note here when a cooldown you asked about is ready.</p>
            ) : (
              <ul>
                {notices.map((notice) => (
                  <li key={notice.id} className={notice.readAt ? "read" : ""}>
                    <button type="button" onClick={() => void markOne(notice.id)} disabled={notice.readAt !== null}>
                      <span>{notice.body}</span>
                      <time dateTime={notice.createdAt}>{ago(notice.createdAt)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
      {toasts.length > 0 ? (
        <div className="notice-toasts">
          {toasts.map((notice) => (
            <button key={notice.id} type="button" className="notice-toast" onClick={() => void markOne(notice.id)}>
              {notice.body}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
