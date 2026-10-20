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

export type ChannelPost = {
  discordId: string;
  content: string;
  files: Array<{ name: string; data: string }>;
  gifUrls: string[];
  stickerIds: string[];
};

/** Ask the bot to post in the drop channel as this player. */
export async function postChannelMessage(post: ChannelPost): Promise<void> {
  const base = process.env["BOT_INTERNAL_URL"]?.replace(/\/$/, "");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) throw new Error("missing");
  const res = await fetch(`${base}/internal/channel-message`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(post),
  });
  if (res.status === 204) return;
  let message = "";
  try {
    const json = (await res.json()) as { error?: string };
    message = json.error ?? "";
  } catch {
    message = "";
  }
  const error = new Error(message || "failed") as Error & { status?: number };
  error.status = res.status;
  throw error;
}

/** Guild emoji and stickers for the message bar. */
export async function fetchComposerAssets(): Promise<unknown> {
  const base = process.env["BOT_INTERNAL_URL"]?.replace(/\/$/, "");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) throw new Error("missing");
  const res = await fetch(`${base}/internal/composer`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(`Bot composer failed: ${res.status}`);
  return res.json();
}
