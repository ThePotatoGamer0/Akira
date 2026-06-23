import type { CollectionCard } from "../../types/index.js";

export function CollectionGrid(props: {
  cards: CollectionCard[];
  onSelect: (c: CollectionCard) => void;
}) {
  return (
    <div className="card-grid">
      {props.cards.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => props.onSelect(c)}
          style={{
            border: "none",
            padding: 0,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <img className="thumb" src={c.assets.normal} alt={c.character.name} loading="lazy" />
          <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
            {c.character.name}
            <br />
            <span style={{ color: "var(--muted)" }}>#{c.printNumber}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
