import { useCallback, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { apiFetch } from "../lib/api.js";

type State =
  | { status: "idle" | "loading" }
  | { status: "ready"; discordUserId: string; accessToken: string; sdk: DiscordSDK }
  | { status: "error"; message: string };

/**
 * Discord launches the activity with `frame_id` in the query, inside discord.com
 * or a discordsays.com frame. A normal visit to the site has neither.
 */
export function isDiscordActivityContext(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has("frame_id")) return true;
  const list = window.location.ancestorOrigins;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const origin = list.item(i);
    if (!origin) continue;
    try {
      const host = new URL(origin).hostname;
      if (host === "discord.com" || host.endsWith(".discord.com") || host === "discordsays.com" || host.endsWith(".discordsays.com")) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

function sdkFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    const code = "code" in error ? error.code : undefined;
    if (typeof message === "string" && message) {
      return typeof code === "number" ? `${message} (${code})` : message;
    }
  }
  return "Failed to start Discord SDK";
}

/**
 * Initialise the Discord Embedded App SDK (Activity context only).
 */
export function useDiscordSDK(clientId: string | undefined) {
  const [state, setState] = useState<State>({ status: "idle" });

  const connect = useCallback(async () => {
    if (!clientId) {
      setState({ status: "error", message: "Missing VITE_DISCORD_CLIENT_ID" });
      return;
    }
    setState({ status: "loading" });
    try {
      const sdk = new DiscordSDK(clientId);
      await sdk.ready();
      const authorize = {
        client_id: clientId,
        response_type: "code" as const,
        state: "",
        scope: ["identify" as const],
      };
      let code: string;
      try {
        ({ code } = await sdk.commands.authorize({ ...authorize, prompt: "none" }));
      } catch {
        ({ code } = await sdk.commands.authorize(authorize));
      }
      const res = await apiFetch("/auth/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => null)) as { accessToken?: string; error?: string } | null;
      if (!res.ok || !body?.accessToken) {
        setState({
          status: "error",
          message: body?.error ?? "Discord didn't accept that sign-in.",
        });
        return;
      }
      const { user } = await sdk.commands.authenticate({ access_token: body.accessToken });
      if (!user?.id) {
        setState({ status: "error", message: "Discord did not return a user." });
        return;
      }
      setState({ status: "ready", discordUserId: user.id, accessToken: body.accessToken, sdk });
    } catch (e) {
      setState({
        status: "error",
        message: sdkFailureMessage(e),
      });
    }
  }, [clientId]);

  return { state, connect };
}
