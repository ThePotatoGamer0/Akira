import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiIsUp } from "../lib/api.js";
import { applyCollectionPrefs } from "../lib/collectionPrefs.js";
import { clearCachedMe, readCachedMe, writeCachedMe } from "../lib/offlineCache.js";
import type { Me } from "../types/index.js";
import { isDiscordActivityContext, useDiscordSDK } from "./useDiscordSDK.js";
import { useVisiblePoll } from "./useVisiblePoll.js";

export { apiFetch, apiUrl } from "../lib/api.js";

export function useAuth() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  const { state: sdkState, connect, layout } = useDiscordSDK(clientId);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiUp, setApiUp] = useState(false);
  const [liveRev, setLiveRev] = useState(0);

  const isDiscordActivity = useMemo(() => isDiscordActivityContext(), []);

  const activityToken = sdkState.status === "ready" ? sdkState.accessToken : undefined;
  const discordUserId = sdkState.status === "ready" ? sdkState.discordUserId : undefined;

  const refreshMe = useCallback(async (overrideToken?: string) => {
    const token = overrideToken ?? activityToken;
    const res = await apiFetch("/auth/me", {}, isDiscordActivity ? token : undefined);
    if (!res.ok) {
      if (res.status === 401) clearCachedMe();
      setMe(res.status === 401 ? null : (readCachedMe() ?? null));
      if (isDiscordActivity) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Akira couldn't find a player with that Discord username.");
      }
      return false;
    }
    const data = (await res.json()) as Me;
    const next = applyCollectionPrefs(data);
    writeCachedMe(next);
    setMe(next);
    setError(null);
    if (
      res.headers.get("X-Akira-Cache") !== "1" &&
      (next.collectionOrder !== data.collectionOrder || next.continuousScroll !== data.continuousScroll)
    ) {
      void apiFetch(
        "/auth/me",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionOrder: next.collectionOrder,
            continuousScroll: next.continuousScroll,
          }),
        },
        isDiscordActivity ? token : undefined,
      );
    }
    return true;
  }, [isDiscordActivity, activityToken]);

  const fetchApi = useCallback(
    (path: string, init?: RequestInit) =>
      apiFetch(path, init, isDiscordActivity ? activityToken : undefined),
    [isDiscordActivity, activityToken, apiUp],
  );

  useEffect(() => {
    if (!isDiscordActivity) return;
    void connect();
  }, [isDiscordActivity, connect]);

  const checkConnection = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    const cached = readCachedMe();
    if (cached) setMe((current) => current ?? cached);
    const up = await apiIsUp();
    if (!up) {
      setApiUp(false);
      setMe((current) => current ?? cached);
      if (!opts?.quiet) setLoading(false);
      return false;
    }
    setApiUp(true);
    try {
      await refreshMe();
    } catch {
      setMe((current) => current ?? cached);
    }
    if (!opts?.quiet) setLoading(false);
    return true;
  }, [refreshMe]);

  useEffect(() => {
    if (isDiscordActivity) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const cached = readCachedMe();
      if (cached) {
        setMe(cached);
        setLoading(false);
      }
      const up = await apiIsUp();
      if (cancelled) return;
      if (!up) {
        setApiUp(false);
        setMe((current) => current ?? cached);
        setLoading(false);
        return;
      }
      setApiUp(true);
      try {
        await refreshMe();
      } catch {
        if (!cancelled) setMe((current) => current ?? cached);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDiscordActivity, refreshMe]);

  useEffect(() => {
    if (isDiscordActivity || apiUp || loading) return;
    const id = window.setInterval(() => {
      void checkConnection({ quiet: true });
    }, 8000);
    return () => window.clearInterval(id);
  }, [isDiscordActivity, apiUp, loading, checkConnection]);

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

  const pollLive = useCallback(() => {
    void refreshMe();
    setLiveRev((value) => value + 1);
  }, [refreshMe]);

  useVisiblePoll(pollLive, 4000, Boolean(apiUp && me && !loading && !isDiscordActivity));

  return {
    isDiscordActivity,
    activityLayout: layout,
    discordSdk: sdkState.status === "ready" ? sdkState.sdk : undefined,
    discordUserId,
    me: me ? applyCollectionPrefs(me) : null,
    loading: loading || sdkState.status === "loading",
    error,
    apiUp,
    refreshMe,
    checkConnection,
    fetchApi,
    liveRev,
  };
}
