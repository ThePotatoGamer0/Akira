import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import type { Me } from "../types/index.js";
import { isDiscordActivityContext, useDiscordSDK } from "./useDiscordSDK.js";

export { apiFetch, apiUrl } from "../lib/api.js";

export function useAuth() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  const { state: sdkState, connect } = useDiscordSDK(clientId);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDiscordActivity = useMemo(() => isDiscordActivityContext(), []);

  const activityToken = sdkState.status === "ready" ? sdkState.accessToken : undefined;
  const discordUserId = sdkState.status === "ready" ? sdkState.discordUserId : undefined;

  const refreshMe = useCallback(async (overrideToken?: string) => {
    const token = overrideToken ?? activityToken;
    const res = await apiFetch("/auth/me", {}, isDiscordActivity ? token : undefined);
    if (!res.ok) {
      setMe(null);
      if (isDiscordActivity) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Akira couldn't find a player with that Discord username.");
      }
      return false;
    }
    const data = (await res.json()) as Me;
    setMe(data);
    setError(null);
    return true;
  }, [isDiscordActivity, activityToken]);

  const fetchApi = useCallback(
    (path: string, init?: RequestInit) =>
      apiFetch(path, init, isDiscordActivity ? activityToken : undefined),
    [isDiscordActivity, activityToken],
  );

  useEffect(() => {
    if (!isDiscordActivity) return;
    void connect();
  }, [isDiscordActivity, connect]);

  useEffect(() => {
    if (isDiscordActivity) return;
    let cancelled = false;
    void refreshMe().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isDiscordActivity, refreshMe]);

  useEffect(() => {
    if (sdkState.status === "ready") {
      setLoading(true);
      void refreshMe(sdkState.accessToken).finally(() => setLoading(false));
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
