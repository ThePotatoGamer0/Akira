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

export async function apiFetch(
  path: string,
  init?: RequestInit,
  activityToken?: string,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (activityToken) headers.set("Authorization", `Bearer ${activityToken}`);
  return fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: activityToken ? "omit" : "include",
  });
}
