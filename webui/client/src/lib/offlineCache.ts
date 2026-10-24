import type { Me } from "../types/index.js";

const KEY = "akira.offline.v1";
const MAX_GETS = 80;
const MAX_BODY = 180_000;
const NAP_ERROR = "Akira is napping, so that didn't go through.";

type GetEntry = { at: number; body: string };
type Store = { me: Me | null; gets: Record<string, GetEntry> };

function blank(): Store {
  return { me: null, gets: {} };
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      me: parsed.me && typeof parsed.me === "object" ? parsed.me : null,
      gets: parsed.gets && typeof parsed.gets === "object" ? parsed.gets : {},
    };
  } catch {
    return blank();
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    const entries = Object.entries(store.gets).sort((a, b) => a[1].at - b[1].at);
    store.gets = Object.fromEntries(entries.slice(Math.floor(entries.length / 2)));
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* Private mode or a full disk. Looking around still works for this visit. */
    }
  }
}

export function readCachedMe(): Me | null {
  return readStore().me;
}

export function writeCachedMe(me: Me): void {
  const store = readStore();
  store.me = me;
  writeStore(store);
}

export function clearCachedMe(): void {
  const store = readStore();
  store.me = null;
  store.gets = {};
  writeStore(store);
}

export function cacheableGet(path: string, init?: RequestInit): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return false;
  if (path.startsWith("/health")) return false;
  if (path.startsWith("/auth/") && path.split("?")[0] !== "/auth/me") return false;
  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/channel")) return false;
  return true;
}

export function rememberGet(path: string, body: string): void {
  if (body.length > MAX_BODY) return;
  const store = readStore();
  store.gets[path] = { at: Date.now(), body };
  const extras = Object.entries(store.gets).sort((a, b) => b[1].at - a[1].at);
  if (extras.length > MAX_GETS) {
    store.gets = Object.fromEntries(extras.slice(0, MAX_GETS));
  }
  writeStore(store);
}

export function readCachedGet(path: string): string | null {
  return readStore().gets[path]?.body ?? null;
}

export function cachedJsonResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Akira-Cache": "1" },
  });
}

export function nappingMutationResponse(): Response {
  return new Response(JSON.stringify({ error: NAP_ERROR }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

export function shouldUseCache(res: Response | null): boolean {
  if (!res) return true;
  return res.status >= 500;
}
