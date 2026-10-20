import { useRef } from "react";
import { useGsapCardTilt } from "../../lib/card-tilt.js";
import { QualityStars, TagMark } from "../marks.js";
import { qualityCondition, showsShiny } from "../../lib/quality.js";
import type { CollectionCard } from "../../types/index.js";
import { apiUrl } from "../../hooks/useAuth.js";

function CollectionTile(props: {
  card: CollectionCard;
  selecting: boolean;
  selected: boolean;
  onSelect: (card: CollectionCard) => void;
  onToggle: (card: CollectionCard) => void;
}) {
  const { card } = props;
  const rootRef = useRef<HTMLButtonElement>(null);
  const artRef = useRef<HTMLSpanElement>(null);
  useGsapCardTilt(rootRef, artRef, 14);
  const condition = qualityCondition(card.quality);

  return (
    <button
      ref={rootRef}
      type="button"
      className={props.selected ? "collection-tile is-selected" : "collection-tile"}
      aria-pressed={props.selecting ? props.selected : undefined}
      aria-label={
        props.selecting
          ? `${props.selected ? "Deselect" : "Select"} ${card.character.name}, ${card.id}`
          : `${card.character.name}, ${condition}, ${card.id}`
      }
      onClick={() => (props.selecting ? props.onToggle(card) : props.onSelect(card))}
    >
      <span className="collection-tile__art" ref={artRef}>
        {props.selecting ? <span className="collection-tile__check" aria-hidden="true" /> : null}
        <img
          className="thumb"
          src={apiUrl(showsShiny(card.quality, card.dye) ? card.assets.shiny : card.assets.normal)}
          alt=""
          loading="lazy"
        />
        <span className="card-glare" />
      </span>
      <span className="collection-tile__chin">
        <span className="collection-tile__emoji">
          <TagMark emoji={card.tagEmoji} size={12} />
        </span>
        <span className="collection-tile__stars">
          <QualityStars quality={card.quality} size={12} />
        </span>
        <code>{card.id}</code>
      </span>
    </button>
  );
}

export function CollectionGrid(props: {
  cards: CollectionCard[];
  selecting: boolean;
  selectedIds: ReadonlySet<string>;
  onSelect: (c: CollectionCard) => void;
  onToggle: (c: CollectionCard) => void;
}) {
  if (props.cards.length === 0) {
    return <p className="webui-muted">No cards match.</p>;
  }
  return (
    <div className="card-grid">
      {props.cards.map((card) => (
        <CollectionTile
          key={card.id}
          card={card}
          selecting={props.selecting}
          selected={props.selectedIds.has(card.id)}
          onSelect={props.onSelect}
          onToggle={props.onToggle}
        />
      ))}
    </div>
  );
}
