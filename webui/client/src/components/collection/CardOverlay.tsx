import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useGsapCardTilt } from "../../lib/card-tilt.js";
import { MenuSelect } from "../MenuSelect.js";
import { QualityStars, TagMark } from "../marks.js";
import { frameLabel } from "../../lib/frames.js";
import { qualityCondition, showsShiny } from "../../lib/quality.js";
import type { CollectionCard, CollectionStudio } from "../../types/index.js";
import { apiUrl } from "../../hooks/useAuth.js";

function assetUrl(card: CollectionCard, frameId: number, shiny: boolean): string {
  const dye = card.dye && /^[a-zA-Z0-9_-]+$/.test(card.dye) ? card.dye : "none";
  const file = shiny ? "shiny.apng" : "normal.png";
  return apiUrl(`/api/static/cards/${card.variant.id}/${frameId}/p${card.printNumber}/${dye}/${file}`);
}

export function CardOverlay(props: {
  card: CollectionCard;
  studio: CollectionStudio;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (cardId: string, patch: Partial<CollectionCard>) => void;
  onBurned: (cardId: string) => void;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  userId: string;
}) {
  const { card, studio } = props;
  const [draftFrame, setDraftFrame] = useState<number | null>(card.frameChoice);
  const [tagValue, setTagValue] = useState(card.tag ?? "");
  const [shiny, setShiny] = useState(() => showsShiny(card.quality, card.dye));
  const [drawnSrc, setDrawnSrc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [burnAsk, setBurnAsk] = useState(false);
  const [burnedBits, setBurnedBits] = useState<number | null>(null);
  const [quoteBits, setQuoteBits] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  useGsapCardTilt(stageRef, tiltRef, 10, "driver");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [props.onClose]);

  useEffect(() => {
    setTagValue(card.tag ?? "");
  }, [card.tag]);

  useEffect(() => {
    setDraftFrame(card.frameChoice);
  }, [card.frameChoice]);

  const previewFrame = draftFrame ?? studio.personalFrame ?? studio.serverFrame;
  const fallbackLabel = studio.personalFrame === null
    ? `Server frame · ${frameLabel(studio.frames, studio.serverFrame)}`
    : `Your frame · ${frameLabel(studio.frames, studio.personalFrame)}`;
  const canShiny = card.quality === "LEGENDARY" || Boolean(card.dye);
  const src = burnedBits !== null ? apiUrl(card.assets.burn) : assetUrl(card, previewFrame, canShiny && shiny);
  const shownEmoji = tagValue ? studio.tags.find((tag) => tag.name === tagValue)?.emoji ?? card.tagEmoji : null;
  const edition = card.variant.name !== card.character.name ? card.variant.name : null;
  const seriesHref = `/characters/${encodeURIComponent(card.series.slug)}`;
  const characterHref = `${seriesHref}/${encodeURIComponent(card.character.slug)}`;

  async function changeFrame(next: string) {
    const choice = next === "" ? null : Number(next);
    if (choice === draftFrame || (choice !== null && !Number.isInteger(choice))) return;
    const previous = draftFrame;
    setDraftFrame(choice);
    setBusy("frame");
    setError(null);
    try {
      const res = await props.fetchApi(`/collection/${props.userId}/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameId: choice }),
      });
      const json = (await res.json()) as Partial<CollectionCard> & { error?: string };
      if (!res.ok) {
        setDraftFrame(previous);
        setError(json.error ?? "Akira couldn't save that frame.");
        return;
      }
      props.onSaved(card.id, json);
    } catch {
      setDraftFrame(previous);
      setError("Akira couldn't save that frame.");
    } finally {
      setBusy(null);
    }
  }

  async function changeTag(next: string) {
    const previous = tagValue;
    if (next === previous) return;
    setTagValue(next);
    setBusy("tag");
    setError(null);
    try {
      const res = await props.fetchApi(`/collection/${props.userId}/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: next === "" ? null : next }),
      });
      const json = (await res.json()) as Partial<CollectionCard> & { error?: string };
      if (!res.ok) {
        setTagValue(previous);
        setError(json.error ?? "Akira couldn't save that tag.");
        return;
      }
      props.onSaved(card.id, json);
    } catch {
      setTagValue(previous);
      setError("Akira couldn't save that tag.");
    } finally {
      setBusy(null);
    }
  }

  async function askBurn() {
    setBusy("burn");
    setError(null);
    try {
      const res = await props.fetchApi(`/collection/${props.userId}/burn-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: [card.id] }),
      });
      const json = (await res.json()) as { awarded?: number; error?: string };
      if (!res.ok || typeof json.awarded !== "number") {
        setError(json.error ?? "Akira couldn't price that burn.");
        return;
      }
      setQuoteBits(json.awarded);
      setBurnAsk(true);
    } catch {
      setError("Akira couldn't price that burn.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmBurn() {
    setBusy("burn");
    setError(null);
    try {
      const res = await props.fetchApi(`/collection/${props.userId}/burn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: [card.id] }),
      });
      const json = (await res.json()) as { awarded?: number; error?: string };
      if (!res.ok || typeof json.awarded !== "number") {
        setError(json.error ?? "Akira couldn't burn that card.");
        return;
      }
      setBurnedBits(json.awarded);
      setBurnAsk(false);
      setDrawnSrc("");
      props.onBurned(card.id);
    } catch {
      setError("Akira couldn't burn that card.");
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div className="card-overlay" role="dialog" aria-modal="true" aria-labelledby="card-overlay-title">
      <div
        ref={stageRef}
        className="card-overlay__stage"
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <button type="button" className="card-overlay__close" onClick={props.onClose}>
          Close
        </button>
        <div className="card-overlay__float">
          <div className="card-overlay__tilt" ref={tiltRef}>
            <img
              key={src}
              className={drawnSrc === src ? "card-overlay__art" : "card-overlay__art is-waiting"}
              src={src}
              alt={card.character.name}
              onLoad={() => setDrawnSrc(src)}
              onError={() => {
                setDrawnSrc(src);
                setError("Akira couldn't draw that frame.");
              }}
            />
            <span className="card-glare" />
          </div>
        </div>
        {canShiny && burnedBits === null ? (
          <div className="card-overlay__shiny">
            <button type="button" className="chip" aria-pressed={!shiny} onClick={() => setShiny(false)}>
              Normal
            </button>
            <button type="button" className="chip" aria-pressed={shiny} onClick={() => setShiny(true)}>
              Shiny
            </button>
          </div>
        ) : null}
      </div>
      <aside className="card-overlay__meta">
        <p className="card-overlay__kicker">
          <Link to={seriesHref}>{card.series.name}</Link>
        </p>
        <h2 id="card-overlay-title">
          <Link to={characterHref}>{card.character.name}</Link>
        </h2>
        {edition ? <p className="card-overlay__edition">Edition · {edition}</p> : null}
        <p className="card-overlay__line">
          <span className="card-overlay__stars">
            <QualityStars quality={card.quality} size={16} />
          </span>{" "}
          {qualityCondition(card.quality)}
        </p>
        <p className="card-overlay__code">
          <TagMark emoji={shownEmoji} size={15} />
          <code>{card.id}</code>
          <span>· #{card.printNumber}</span>
          <span>· {frameLabel(studio.frames, previewFrame)}</span>
        </p>
        {card.alias ? <p className="card-overlay__note">Alias · {card.alias}</p> : null}
        <p className="card-overlay__note">
          {props.canEdit ? "Yours since" : "Collected"}{" "}
          {new Date(card.obtainedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </p>

        <section>
          <h3>Frame</h3>
          <MenuSelect
            className="card-overlay__select"
            label="Frame"
            value={draftFrame === null ? "" : String(draftFrame)}
            disabled={!props.canEdit || busy !== null || burnedBits !== null}
            options={[
              { value: "", label: fallbackLabel },
              ...studio.frames.map((frame) => ({ value: String(frame.id), label: frame.name })),
            ]}
            onChange={(value) => void changeFrame(value)}
          />
        </section>

        <section>
          <h3>Tag</h3>
          <MenuSelect
            className="card-overlay__select"
            label="Tag"
            value={tagValue}
            disabled={!props.canEdit || busy !== null || burnedBits !== null}
            options={[
              { value: "", label: "Untagged" },
              ...studio.tags.map((tag) => ({ value: tag.name, label: `${tag.emoji} ${tag.name}` })),
              ...(tagValue && !studio.tags.some((tag) => tag.name === tagValue) ? [{ value: tagValue, label: tagValue }] : []),
            ]}
            onChange={(value) => void changeTag(value)}
          />
          {studio.tags.length === 0 ? (
            <p className="card-overlay__hint">Make tags with Tags on the collection page.</p>
          ) : null}
        </section>

        <section>
          <h3>Burn</h3>
          {burnedBits !== null ? (
            <p className="card-overlay__note">Akira tucked {burnedBits} bits away. This card is gone.</p>
          ) : burnAsk ? (
            <div className="card-overlay__confirm">
              <p>Burn this card for {quoteBits ?? "…"} bits? This can't be undone.</p>
              <button type="button" className="danger" disabled={busy !== null} onClick={() => void confirmBurn()}>
                {busy === "burn" ? "Burning…" : "Burn it"}
              </button>
              <button type="button" className="secondary" disabled={busy !== null} onClick={() => setBurnAsk(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" className="secondary" disabled={!props.canEdit || busy !== null} onClick={() => void askBurn()}>
              {busy === "burn" ? "Checking…" : "Burn this card"}
            </button>
          )}
        </section>

        {error ? (
          <p className="card-overlay__error" role="alert">
            {error}
          </p>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
