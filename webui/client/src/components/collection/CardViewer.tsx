import { useState } from "react";
import type { CollectionCard } from "../../types/index.js";

export function CardViewer(props: { card: CollectionCard | null }) {
  const [shiny, setShiny] = useState(false);
  if (!props.card) {
    return <p>Pick a card to see it up close.</p>;
  }
  const c = props.card;
  const src = shiny ? c.assets.shiny : c.assets.normal;
  return (
    <div className="panel">
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button type="button" className={!shiny ? undefined : "secondary"} onClick={() => setShiny(false)}>
          Normal
        </button>
        <button type="button" className={shiny ? undefined : "secondary"} onClick={() => setShiny(true)}>
          Shiny (APNG)
        </button>
      </div>
      <img
        src={src}
        alt={c.character.name}
        style={{ maxWidth: "100%", borderRadius: 12, display: "block" }}
      />
      <h3>{c.character.name}</h3>
      <p>
        {c.series.name} · Frame {c.frameId} · {c.quality} · Print #{c.printNumber}
      </p>
      {c.alias ? <p>Alias: {c.alias}</p> : null}
      {c.tag ? <p>Tag: {c.tag}</p> : null}
    </div>
  );
}
