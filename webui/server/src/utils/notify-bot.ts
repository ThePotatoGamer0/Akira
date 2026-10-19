/**
 * Ask the Discord bot (internal HTTP) to DM a verification code.
 */
export async function sendVerificationDm(discordId: string, code: string, expiresAt: number): Promise<void> {
  const base = process.env["BOT_INTERNAL_URL"]?.replace(/\/$/, "");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) {
    console.warn(
      "[webui] BOT_INTERNAL_URL or AKIRA_INTERNAL_SECRET missing - verification code (dev only):",
      code,
      "discordId:",
      discordId,
    );
    return;
  }
  const res = await fetch(`${base}/internal/dm-verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ discordId, code, expiresAt }),
  });
  if (!res.ok) {
    throw new Error(`Bot notify failed: ${res.status} ${await res.text()}`);
  }
}

/** Ask the bot to arm or cancel the timer for a reminder the WebUI just changed. */
export async function queueReminder(discordId: string, type: "DAILY" | "DROP" | "GRAB"): Promise<void> {
  const base = process.env["BOT_INTERNAL_URL"]?.replace(/\/$/, "");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) return;
  const res = await fetch(`${base}/internal/queue-reminder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ discordId, type }),
  });
  if (!res.ok) {
    throw new Error(`Bot reminder failed: ${res.status} ${await res.text()}`);
  }
}
