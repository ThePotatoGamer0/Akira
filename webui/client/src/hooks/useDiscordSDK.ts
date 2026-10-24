import { useCallback, useEffect, useState } from "react";
import { Common, DiscordSDK, Events, patchUrlMappings } from "@discord/embedded-app-sdk";
import { API_PROXY_PREFIX, apiFetch, onDiscordActivityProxy } from "../lib/api.js";

/** Discord's small activity frames. Focused is the full activity. */
export type ActivityLayout = "focused" | "pip" | "grid";

function activityLayout(mode: number): ActivityLayout {
  if (mode === Common.LayoutModeTypeObject.PIP) return "pip";
  if (mode === Common.LayoutModeTypeObject.GRID) return "grid";
  return "focused";
}

function devLayoutOverride(): ActivityLayout | null {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(window.location.search).get("layout");
  if (value === "pip" || value === "grid") return value;
  return null;
}

let apiProxyPatched = false;

/**
 * Inside Discord the page is served from discordsays.com, and that proxy
 * refuses any request to another host. Rewrite leftover API-host URLs onto /api,
 * which the portal mapping forwards to the real API. Fetches already use /api
 * via `apiUrl` when this host is discordsays.com.
 */
function patchActivityApi(): void {
  if (apiProxyPatched) return;
  if (!onDiscordActivityProxy()) return;
  const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  if (!apiBase) return;
  let target: string;
  try {
    target = new URL(apiBase).host;
  } catch {
    return;
  }
  patchUrlMappings([{ prefix: API_PROXY_PREFIX, target }], { patchSrcAttributes: true });
  apiProxyPatched = true;
}

if (typeof window !== "undefined") patchActivityApi();

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
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; code?: unknown };
    const message = typeof record.message === "string" ? record.message : "";
    const code = typeof record.code === "number" ? String(record.code) : "";
    if (message && code) return `${message} (${code})`;
    if (message) return message;
    if (code) return `Discord refused the sign-in (${code}).`;
    try {
      return JSON.stringify(error);
    } catch {
      return "Failed to start Discord SDK";
    }
  }
  return "Failed to start Discord SDK";
}

/**
 * Initialise the Discord Embedded App SDK (Activity context only).
 */
export function useDiscordSDK(clientId: string | undefined) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [layout, setLayout] = useState<ActivityLayout>(() => devLayoutOverride() ?? "focused");
  const sdk = state.status === "ready" ? state.sdk : null;

  useEffect(() => {
    if (!sdk) return;
    const onLayout = (data: { layout_mode: number }) => {
      setLayout(activityLayout(data.layout_mode));
    };
    void sdk.subscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, onLayout);
    return () => {
      void sdk.unsubscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, onLayout);
    };
  }, [sdk]);

  const connect = useCallback(async () => {
    if (!clientId) {
      setState({ status: "error", message: "Missing VITE_DISCORD_CLIENT_ID" });
      return;
    }
    setState({ status: "loading" });
    try {
      patchActivityApi();
      const sdk = new DiscordSDK(clientId);
      await sdk.ready();
      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify"],
      });
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
      console.error("Discord SDK", e);
      setState({
        status: "error",
        message: sdkFailureMessage(e),
      });
    }
  }, [clientId]);

  return { state, connect, layout };
}
