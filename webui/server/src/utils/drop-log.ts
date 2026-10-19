/** Ask the Discord bot for the raw drop-channel log. */
export async function fetchDropLog(): Promise<unknown> {
  const base = process.env["BOT_INTERNAL_URL"]?.replace(/\/$/, "");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) {
    throw new Error("missing");
  }
  const res = await fetch(`${base}/internal/drop-log`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (res.status === 404) throw new Error("no-channel");
  if (!res.ok) throw new Error(`Bot log failed: ${res.status}`);
  return res.json();
}
