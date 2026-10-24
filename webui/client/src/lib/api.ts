import {
  cacheableGet,
  cachedJsonResponse,
  nappingMutationResponse,
  rememberGet,
  readCachedGet,
  shouldUseCache,
} from "./offlineCache.js";

const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

/** WebSocket URL for an API path. Uses the API host when VITE_API_URL is set. */
export function apiSocketUrl(path: string): string {
  const httpUrl = apiUrl(path);
  if (/^https?:\/\//.test(httpUrl)) return httpUrl.replace(/^http/, "ws");
  const url = new URL(httpUrl, window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function cacheGet(path: string, init?: RequestInit): Response | null {
  if (!cacheableGet(path, init)) return null;
  const body = readCachedGet(path);
  return body ? cachedJsonResponse(body) : null;
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
  activityToken?: string,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (activityToken) headers.set("Authorization", `Bearer ${activityToken}`);
  try {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers,
      credentials: activityToken ? "omit" : "include",
    });
    if (res.ok && cacheableGet(path, init)) {
      const text = await res.clone().text();
      rememberGet(path, text);
    }
    if (shouldUseCache(res)) {
      const cached = cacheGet(path, init);
      if (cached) return cached;
      if (!cacheableGet(path, init)) return nappingMutationResponse();
    }
    return res;
  } catch {
    const cached = cacheGet(path, init);
    if (cached) return cached;
    if (!cacheableGet(path, init)) return nappingMutationResponse();
    return nappingMutationResponse();
  }
}

/** True when GET /health returns `{ ok: true }`. A dropped connection counts as down. */
export async function apiIsUp(timeoutMs = 5000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase}/health`, { signal: ctrl.signal, credentials: "include" });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    return body?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
