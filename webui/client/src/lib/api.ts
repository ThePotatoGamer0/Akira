const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
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
