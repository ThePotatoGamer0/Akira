import { useCallback, useEffect, useState } from "react";
import { readStatChoice, writeStatChoice } from "../../lib/statChoice.js";
import type { CompletionRow, CompletionStats, Me } from "../../types/index.js";
import { MenuSelect } from "../MenuSelect.js";
import { StatShell } from "./StatShell.js";

function settleView(current: string, json: CompletionStats): string {
  if (current === "top") return "top";
  if (current === "tracked") return json.tracked.length > 0 ? "tracked" : "top";
  if (json.series.some((row) => row.seriesId === current)) return current;
  return json.tracked.length > 0 ? "tracked" : "top";
}

export function CompletionStat(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [userId, setUserId] = useState(() => readStatChoice("completion.player", props.me.id));
  const [view, setView] = useState(() => readStatChoice("completion.view", ""));
  const [data, setData] = useState<CompletionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (id: string) => {
      const res = await props.fetchApi(`/stats/completion?userId=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "Akira couldn't load completion.");
      }
      return (await res.json()) as CompletionStats;
    },
    [props.fetchApi],
  );

  useEffect(() => {
    let cancelled = false;
    setData(null);
    void load(userId)
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setError(null);
        setView((current) => {
          const next = settleView(current, json);
          if (next !== current) writeStatChoice("completion.view", next);
          return next;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (userId !== props.me.id) {
          writeStatChoice("completion.player", props.me.id);
          setUserId(props.me.id);
          return;
        }
        setError(err instanceof Error ? err.message : "Akira couldn't load completion.");
      });
    return () => {
      cancelled = true;
    };
  }, [load, userId]);

  const mine = userId === props.me.id;
  const focused = data?.series.find((row) => row.seriesId === view) ?? null;
  const bars = !data ? [] : view === "tracked" ? data.tracked : focused ? [focused] : data.top;
  const selectView = view === "tracked" && (data?.tracked.length ?? 0) > 0 ? "tracked" : focused ? view : "top";
  const players = data?.players ?? [{ id: props.me.id, name: props.me.displayName }];
  const playerValue = players.some((player) => player.id === userId) ? userId : props.me.id;

  async function toggle(row: CompletionRow) {
    if (!mine) return;
    setBusy(true);
    setError(null);
    try {
      const res = await props.fetchApi("/stats/tracked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId: row.seriesId, tracked: !row.tracked }),
      });
      const json = (await res.json()) as CompletionStats & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Akira couldn't update that.");
        return;
      }
      if (userId === props.me.id) setData(json);
    } catch {
      setError("Akira couldn't update that.");
    } finally {
      setBusy(false);
    }
  }

  function choosePlayer(next: string) {
    setUserId(next);
    writeStatChoice("completion.player", next);
  }

  function chooseView(next: string) {
    setView(next);
    writeStatChoice("completion.view", next);
  }

  const note = data
    ? focused
      ? `${data.user.name} · ${focused.name}`
      : view === "tracked"
        ? `${data.user.name} · tracked`
        : `${data.user.name} · highest completion`
    : "Characters collected in a series";

  return (
    <StatShell
      title="Completion"
      note={note}
      controls={
        <>
          <MenuSelect
            className="stats-select"
            label="Player"
            value={playerValue}
            options={players.map((player) => ({ value: player.id, label: player.name }))}
            onChange={choosePlayer}
          />
          <MenuSelect
            className="stats-select"
            label="Anime"
            value={selectView}
            options={[
              { value: "top", label: "Top four" },
              ...(data && data.tracked.length > 0 ? [{ value: "tracked", label: "Tracked" }] : []),
              ...(data?.series ?? []).map((row) => ({ value: row.seriesId, label: row.name })),
            ]}
            onChange={chooseView}
          />
        </>
      }
    >
      {error ? <p className="webui-alert">{error}</p> : null}
      {data ? (
        bars.length === 0 ? (
          <p className="webui-muted">No characters collected yet.</p>
        ) : (
          <div className="completion-stack">
            {bars.map((row) => (
              <div key={row.seriesId} className={mine ? "completion-row completion-row--editable" : "completion-row"}>
                <div className="completion-row__label">
                  <span>{row.name}</span>
                  <span>
                    {row.owned}/{row.total} · {row.percent}%
                  </span>
                </div>
                <div className="completion-row__track" aria-hidden="true">
                  <span className="completion-row__fill" style={{ width: `${row.percent}%` }} />
                </div>
                {mine ? (
                  <button type="button" className="secondary stats-pin" disabled={busy} onClick={() => void toggle(row)}>
                    {row.tracked ? "Untrack" : "Track"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : (
        <p className="webui-muted">Akira is checking completion…</p>
      )}
    </StatShell>
  );
}
