import { useEffect, useState } from "react";
import type { BitsRow, Me } from "../../types/index.js";
import { MeterList } from "./MeterList.js";
import { StatShell } from "./StatShell.js";

export function EconomyStat(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [rows, setRows] = useState<BitsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await props.fetchApi("/stats/bits");
      if (cancelled) return;
      if (!res.ok) {
        setError("Akira couldn't load bits.");
        return;
      }
      const json = (await res.json()) as { rows: BitsRow[] };
      setRows(json.rows);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.fetchApi]);

  return (
    <StatShell title="Economy" note="Who has the most bits">
      {error ? <p className="webui-alert">{error}</p> : null}
      {rows ? (
        <MeterList
          youId={props.me.id}
          empty="No players yet."
          rows={rows.map((row) => ({
            id: row.id,
            name: row.name,
            value: row.bits,
            label: `${row.bits.toLocaleString()} bits`,
          }))}
        />
      ) : (
        <p className="webui-muted">Akira is counting bits…</p>
      )}
    </StatShell>
  );
}
