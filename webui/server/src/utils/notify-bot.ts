/**
 * Ask the Discord bot (internal HTTP) to DM a verification code.
 */
export async function sendVerificationDm(discordId: string, code: string): Promise<void> {
  const base = process.env["BOT_INTERNAL_URL"]?.replace(/\/$/, "");
  const secret = process.env["AKIRA_INTERNAL_SECRET"] ?? "";
  if (!base || !secret) {
    console.warn(
      "[webui] BOT_INTERNAL_URL or AKIRA_INTERNAL_SECRET missing — verification code (dev only):",
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
    body: JSON.stringify({ discordId, code }),
  });
  if (!res.ok) {
    throw new Error(`Bot notify failed: ${res.status} ${await res.text()}`);
  }
}
