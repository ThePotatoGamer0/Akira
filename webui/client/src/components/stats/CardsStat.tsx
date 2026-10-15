import { useEffect, useState } from "react";
import { readStatChoice, writeStatChoice } from "../../lib/statChoice.js";
import type { CardCountRow, Me } from "../../types/index.js";
import { MeterList } from "./MeterList.js";
import { StatShell } from "./StatShell.js";

const QUALITIES = [
  { id: "", label: "All cards" },
  { id: "LEGENDARY", label: "Mint" },
  { id: "EPIC", label: "Excellent" },
  { id: "RARE", label: "Good" },
  { id: "UNCOMMON", label: "Poor" },
  { id: "COMMON", label: "Damaged" },
] as const;

const QUALITY_IDS = new Set<string>(QUALITIES.map((option) => option.id));

export function CardsStat(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [quality, setQuality] = useState(() => {
    const saved = readStatChoice("cards.quality", "");
    return QUALITY_IDS.has(saved) ? saved : "";
  });
  const [rows, setRows] = useState<CardCountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void (async () => {
      const path = quality ? `/stats/cards?quality=${quality}` : "/stats/cards";
      const res = await props.fetchApi(path);
      if (cancelled) return;
      if (!res.ok) {
        setError("Akira couldn't count those cards.");
        return;
      }
      const json = (await res.json()) as { rows: CardCountRow[] };
      setRows(json.rows);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.fetchApi, quality]);

  const label = QUALITIES.find((option) => option.id === quality)?.label ?? "All cards";

  return (
    <StatShell
      title="Cards"
      note={quality ? `Who holds the most ${label.toLowerCase()} cards` : "Who holds the most cards"}
      controls={
        <select
          className="stats-select"
          aria-label="Quality"
          value={quality}
          onChange={(event) => {
            setQuality(event.target.value);
            writeStatChoice("cards.quality", event.target.value);
          }}
        >
          {QUALITIES.map((option) => (
            <option key={option.id || "all"} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      }
    >
      {error ? <p className="webui-alert">{error}</p> : null}
      {rows ? (
        <MeterList
          youId={props.me.id}
          empty="No players yet."
          rows={rows.map((row) => ({ id: row.id, name: row.name, value: row.count, label: row.count.toLocaleString() }))}
        />
      ) : (
        <p className="webui-muted">Akira is counting cards…</p>
      )}
    </StatShell>
  );
}
