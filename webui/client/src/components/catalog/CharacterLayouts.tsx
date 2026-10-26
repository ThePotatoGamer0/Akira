import { useState } from "react";
import { Link } from "react-router-dom";
import { User } from "lucide-react";
import { QualityStars } from "../marks.js";
import { qualityCondition } from "../../lib/quality.js";
import type { CatalogCharacterDetail, CatalogEdition, CatalogHolder } from "../../types/index.js";

const QUALITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;

export type CharacterLayoutProps = {
  data: CatalogCharacterDetail;
  current: CatalogEdition;
  artSrc: string | null;
  thumbs: Array<{ id: string; src: string; name: string }>;
  edition: number;
  setEdition: (index: number) => void;
  busy: boolean;
  onWatch: () => void;
};

function peopleGroups(holders: CatalogHolder[]) {
  return QUALITIES.map((quality) => ({
    quality,
    holders: holders.filter((holder) => holder.quality === quality),
  })).filter((group) => group.holders.length > 0);
}

function holderKey(holder: CatalogHolder) {
  return holder.ownerId ? `${holder.ownerId}-${holder.quality}` : `open-${holder.printNumber}`;
}

function holderHref(holder: CatalogHolder) {
  if (!holder.ownerId || !holder.cardId) return null;
  const params = new URLSearchParams({ player: holder.ownerId, card: holder.cardId });
  return `/collection?${params.toString()}`;
}

function Face(props: { holder: CatalogHolder }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = Boolean(props.holder.avatarUrl) && !broken;
  return (
    <span className={`catalog-face${props.holder.mine ? " is-you" : ""}`}>
      <span className="catalog-face__photo">
        {showPhoto ? (
          <img src={props.holder.avatarUrl ?? ""} alt="" onError={() => setBroken(true)} />
        ) : (
          <User size={16} strokeWidth={2} aria-hidden="true" />
        )}
      </span>
      <span className="catalog-face__print">{props.holder.printNumber}</span>
    </span>
  );
}

export function DeskLayout(props: CharacterLayoutProps) {
  const groups = peopleGroups(props.current.holders ?? []);
  return (
    <div className="catalog-desk">
      <div className="catalog-desk__cover">
        {props.artSrc ? <img src={props.artSrc} alt="" /> : null}
        <div className="catalog-desk__caption">
          <h2>{props.data.name}</h2>
          <p>
            <Link to={`/characters/${props.data.series.slug}`}>{props.data.series.name}</Link>
            {props.current.name !== props.data.name ? ` · ${props.current.name}` : null}
          </p>
          <p>
            {props.current.circulation.toLocaleString("en-GB")} in circulation
            {props.data.owned ? " · in your collection" : ""}
          </p>
        </div>
      </div>
      <div className="catalog-desk__side">
        <div className="catalog-desk__tools">
          <p>{props.data.wishlistCount.toLocaleString("en-GB")} watching</p>
          <button type="button" disabled={props.busy} onClick={() => props.onWatch()}>
            {props.data.wishlisted ? "Stop watching" : "Watch this character"}
          </button>
        </div>
        {props.thumbs.length > 1 ? (
          <div className="catalog-editions">
            {props.thumbs.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index === props.edition ? "is-on" : undefined}
                onClick={() => props.setEdition(index)}
                aria-label={item.name}
              >
                <img src={item.src} alt="" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="catalog-desk__roll">
          {groups.length === 0 ? <p className="webui-muted">Nobody holds this edition yet.</p> : null}
          {groups.map((group) => (
            <section key={group.quality}>
              <h3>
                <QualityStars quality={group.quality} size={11} />
                <span>{qualityCondition(group.quality)}</span>
                <strong>{(props.current.byQuality[group.quality] ?? 0).toLocaleString("en-GB")}</strong>
              </h3>
              <ul>
                {group.holders.map((holder) => {
                  const href = holderHref(holder);
                  const className = holder.mine ? "catalog-desk__row is-you" : "catalog-desk__row";
                  const body = (
                    <>
                      <Face holder={holder} />
                      <span className="catalog-desk__who">
                        <strong>{holder.ownerName}</strong>
                        {holder.mine ? <em>you</em> : null}
                      </span>
                    </>
                  );
                  return (
                    <li key={holderKey(holder)}>
                      {href ? (
                        <Link
                          to={href}
                          className={className}
                          aria-label={`Open print ${holder.printNumber} in ${holder.ownerName}'s collection`}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={className}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
