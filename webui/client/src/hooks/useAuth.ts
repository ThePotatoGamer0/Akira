import { useCallback, useEffect, useMemo, useState } from "react";
import type { Me } from "../types/index.js";
import { useDiscordSDK } from "./useDiscordSDK.js";

const apiBase = import.meta.env.VITE_API_URL ?? "";

function discordActivityContext(): boolean {
  const list = window.location.ancestorOrigins;
  if (!list || list.length === 0) return false;
  for (let i = 0; i < list.length; i++) {
    const o = list.item(i);
    if (o && o.includes("https://discord.com")) return true;
  }
  return false;
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
  discordUserId?: string,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (discordUserId) headers.set("X-Discord-User-Id", discordUserId);
  return fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: discordUserId ? "omit" : "include",
  });
}

export function useAuth() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  const { state: sdkState, connect } = useDiscordSDK(clientId);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDiscordActivity = useMemo(() => discordActivityContext(), []);

  const discordUserId =
    sdkState.status === "ready" ? sdkState.discordUserId : undefined;

  const refreshMe = useCallback(async (overrideDiscordId?: string) => {
    const id = overrideDiscordId ?? discordUserId;
    const res = await apiFetch("/auth/me", {}, isDiscordActivity ? id : undefined);
    if (!res.ok) {
      setMe(null);
      return false;
    }
    const data = (await res.json()) as Me;
    setMe(data);
    setError(null);
    return true;
  }, [isDiscordActivity, discordUserId]);

  const fetchApi = useCallback(
    (path: string, init?: RequestInit) =>
      apiFetch(path, init, isDiscordActivity ? discordUserId : undefined),
    [isDiscordActivity, discordUserId],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (isDiscordActivity) {
        await connect();
        return;
      }
      if (!cancelled) {
        await refreshMe();
      }
      if (!cancelled) setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [isDiscordActivity, connect, refreshMe]);

  useEffect(() => {
    if (sdkState.status === "ready") {
      setLoading(true);
      void refreshMe(sdkState.discordUserId).finally(() => setLoading(false));
    }
    if (sdkState.status === "error") {
      setError(sdkState.message);
      setLoading(false);
    }
  }, [sdkState, refreshMe]);

  return {
    isDiscordActivity,
    discordSdk: sdkState.status === "ready" ? sdkState.sdk : undefined,
    discordUserId,
    me,
    loading: loading || sdkState.status === "loading",
    error,
    refreshMe,
    fetchApi,
  };
}
