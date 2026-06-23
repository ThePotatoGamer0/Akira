import { useEffect, useState } from "react";
import type { LeaderboardRow } from "../../types/index.js";

export function Leaderboard(props: {
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await props.fetchApi("/leaderboard");
      if (res.ok) {
        const j = (await res.json()) as { leaderboard: LeaderboardRow[] };
        setRows(j.leaderboard);
      }
    })();
  }, [props.fetchApi]);

  return (
    <div className="panel">
      <h3>Top collectors</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th>#</th>
            <th>Player</th>
            <th>Bits</th>
            <th>Prestige</th>
            <th>Cards</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td>{r.rank}</td>
              <td>{r.discordUsername ?? r.userId.slice(0, 8)}</td>
              <td>{r.bits.toLocaleString()}</td>
              <td>{r.prestigeLevel}</td>
              <td>{r.cardCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
