import { useState } from "react";
import { CardDesk } from "../components/admin/CardDesk.js";
import { CardPoolManager } from "../components/admin/CardPoolManager.js";
import { InitTrigger } from "../components/admin/InitTrigger.js";
import { PlayerDesk } from "../components/admin/PlayerDesk.js";

type Desk = "players" | "cards" | "catalog";

export function AdminPage(props: {
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [desk, setDesk] = useState<Desk>("players");

  return (
    <div>
      <h2 className="page-title">
        <span className="gradient-text">Admin</span>
      </h2>
      <p className="admin-meta">These edits write straight to the database.</p>
      <div className="admin-switch">
        <button type="button" className={desk === "players" ? "active" : ""} onClick={() => setDesk("players")}>
          Players
        </button>
        <button type="button" className={desk === "cards" ? "active" : ""} onClick={() => setDesk("cards")}>
          Cards
        </button>
        <button type="button" className={desk === "catalog" ? "active" : ""} onClick={() => setDesk("catalog")}>
          Catalog
        </button>
      </div>
      {desk === "players" ? <PlayerDesk fetchApi={props.fetchApi} /> : null}
      {desk === "cards" ? <CardDesk fetchApi={props.fetchApi} /> : null}
      {desk === "catalog" ? (
        <>
          <InitTrigger fetchApi={props.fetchApi} />
          <CardPoolManager fetchApi={props.fetchApi} />
        </>
      ) : null}
    </div>
  );
}
