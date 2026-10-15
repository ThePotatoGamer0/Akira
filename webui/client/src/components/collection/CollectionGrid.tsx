import { useRef } from "react";
import { useGsapCardTilt } from "../../lib/card-tilt.js";
import { QualityStars, TagMark } from "../marks.js";
import { qualityCondition, showsShiny } from "../../lib/quality.js";
import type { CollectionCard } from "../../types/index.js";

function CollectionTile(props: { card: CollectionCard; onSelect: (card: CollectionCard) => void }) {
  const { card } = props;
  const rootRef = useRef<HTMLButtonElement>(null);
  const artRef = useRef<HTMLSpanElement>(null);
  useGsapCardTilt(rootRef, artRef, 14);
  const condition = qualityCondition(card.quality);

  return (
    <button
      ref={rootRef}
      type="button"
      className="collection-tile"
      aria-label={`${card.character.name}, ${condition}, ${card.id}`}
      onClick={() => props.onSelect(card)}
    >
      <span className="collection-tile__art" ref={artRef}>
        <img
          className="thumb"
          src={showsShiny(card.quality, card.dye) ? card.assets.shiny : card.assets.normal}
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
        <span className="collection-tile__condition">{condition}</span>
        <code>{card.id}</code>
      </span>
    </button>
  );
}

export function CollectionGrid(props: {
  cards: CollectionCard[];
  onSelect: (c: CollectionCard) => void;
}) {
  if (props.cards.length === 0) {
    return <p className="webui-muted">No cards match.</p>;
  }
  return (
    <div className="card-grid">
      {props.cards.map((card) => (
        <CollectionTile key={card.id} card={card} onSelect={props.onSelect} />
      ))}
    </div>
  );
}
