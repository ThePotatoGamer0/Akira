/** Ask the Discord bot for the raw drop-channel log. `before` loads the page older than that message. */
export async function fetchDropLog(before?: string): Promise<unknown> {
  const base = process.env["BOT_INTERNAL_URL"]?.replace(/\/$/, "");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) {
    throw new Error("missing");
  }
  const url = new URL(`${base}/internal/drop-log`);
  if (before && /^\d{17,22}$/.test(before)) url.searchParams.set("before", before);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (res.status === 404) throw new Error("no-channel");
  if (!res.ok) throw new Error(`Bot log failed: ${res.status}`);
  return res.json();
}
