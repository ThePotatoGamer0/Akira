import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pin, X } from "lucide-react";
import { DeskLayout } from "../components/catalog/CharacterLayouts.js";
import { MenuSelect } from "../components/MenuSelect.js";
import { apiUrl } from "../hooks/useAuth.js";
import {
  CATALOG_ORDERS,
  applyCatalogTrack,
  catalogOrder,
  sortCatalogCharacters,
  sortCatalogSeries,
  type CatalogOrder,
} from "../lib/catalogView.js";
import type {
  CatalogCharacterCard,
  CatalogCharacterDetail,
  CatalogCover,
  CatalogSearchHit,
  CatalogSeries,
  CatalogSeriesDetail,
} from "../types/index.js";

type FetchApi = (path: string, init?: RequestInit) => Promise<Response>;

function portraitPath(cover: CatalogCover | null): string | null {
  if (!cover) return null;
  const version = cover.v ? `?v=${cover.v}` : "";
  return `/api/static/portraits/${cover.seriesSlug}/${cover.characterSlug}/${encodeURIComponent(cover.image)}${version}`;
}

function portraitSrc(cover: CatalogCover | null): string | null {
  const path = portraitPath(cover);
  return path ? apiUrl(path) : null;
}

function MarqueeText(props: { text: string; className?: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const runRef = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const run = runRef.current;
    if (!wrap || !run) return;
    const measure = () => {
      const next = Math.max(0, Math.ceil(run.scrollWidth - wrap.clientWidth));
      setDistance((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [props.text]);

  const seconds = Math.min(16, Math.max(5, distance / 16));
  return (
    <span
      ref={wrapRef}
      className={`catalog-marquee${props.className ? ` ${props.className}` : ""}${distance > 0 ? " is-overflow" : ""}`}
    >
      <span
        ref={runRef}
        className="catalog-marquee__run"
        style={
          distance > 0
            ? ({
                "--marquee-distance": `${distance}px`,
                "--marquee-duration": `${seconds}s`,
              } as CSSProperties)
            : undefined
        }
      >
        {props.text}
      </span>
    </span>
  );
}

const RING_SIZE = 44;
const RING_STROKE = 3.4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function CompletionRing(props: { percent: number }) {
  const percent = Math.max(0, Math.min(100, props.percent));
  const offset = RING_CIRCUMFERENCE * (1 - percent / 100);
  return (
    <span className="catalog-ring" aria-hidden="true">
      <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} width={RING_SIZE} height={RING_SIZE}>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_SIZE / 2 - 1}
          fill="rgba(18, 10, 28, 0.5)"
          stroke="none"
        />
        <circle
          className="catalog-ring__track"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
        />
        {percent > 0 ? (
          <circle
            className="catalog-ring__fill"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap={percent >= 100 ? "butt" : "round"}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        ) : null}
      </svg>
      <span className={percent >= 100 ? "catalog-ring__value is-full" : "catalog-ring__value"}>
        {percent}
        <span className="catalog-ring__pct">%</span>
      </span>
    </span>
  );
}

function Poster(props: {
  to: string;
  src: string | null;
  title: string;
  note?: string;
  dim?: boolean;
  pinned?: boolean;
  pinBusy?: boolean;
  onPin?: () => void;
  percent?: number;
  owned?: number;
  total?: number;
}) {
  const src = props.src ? apiUrl(props.src) : null;
  const hasScore = props.percent !== undefined && props.owned !== undefined && props.total !== undefined;
  const completed = hasScore && (props.total ?? 0) > 0 && (props.owned ?? 0) >= (props.total ?? 0);
  const status = completed
    ? `${props.title}, completed`
    : hasScore
      ? `${props.title}, ${props.percent}% · ${props.owned} of ${props.total}`
      : props.title;
  return (
    <div className={props.dim ? "catalog-poster is-dim" : "catalog-poster"}>
      <Link to={props.to} className="catalog-poster__hit" aria-label={props.pinned ? `${status}, pinned` : status}>
        {src ? <img src={src} alt="" loading="lazy" /> : <span className="catalog-poster__empty" />}
        <span className="catalog-poster__shade">
          <span className="catalog-poster__copy">
            <MarqueeText className="catalog-poster__title" text={props.title} />
            {props.note ? <MarqueeText className="catalog-poster__note" text={props.note} /> : null}
          </span>
          {completed ? (
            <span className="catalog-poster__count is-done">COMPLETED</span>
          ) : hasScore ? (
            <span className="catalog-poster__score">
              <span className="catalog-poster__count">
                {(props.owned ?? 0).toLocaleString("en-GB")}/{(props.total ?? 0).toLocaleString("en-GB")}
              </span>
              <CompletionRing percent={props.percent ?? 0} />
            </span>
          ) : null}
        </span>
      </Link>
      {props.onPin ? (
        <button
          type="button"
          className={props.pinned ? "catalog-poster__pin is-on" : "catalog-poster__pin"}
          aria-label={props.pinned ? `Untrack ${props.title}` : `Track ${props.title}`}
          aria-pressed={props.pinned ?? false}
          disabled={props.pinBusy}
          onClick={props.onPin}
        >
          <Pin size={14} strokeWidth={2.2} fill={props.pinned ? "currentColor" : "none"} />
        </button>
      ) : null}
    </div>
  );
}

export function CatalogPage(props: { fetchApi: FetchApi }) {
  const { seriesSlug, characterSlug } = useParams();
  if (seriesSlug && characterSlug) {
    return <CharacterSheet seriesSlug={seriesSlug} characterSlug={characterSlug} fetchApi={props.fetchApi} />;
  }
  return <SeriesIndex fetchApi={props.fetchApi} />;
}

function SeriesIndex(props: { fetchApi: FetchApi }) {
  const { seriesSlug } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [series, setSeries] = useState<CatalogSeries[]>([]);
  const [hits, setHits] = useState<CatalogSearchHit[]>([]);
  const [picked, setPicked] = useState<CatalogSeriesDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinning, setPinning] = useState<string | null>(null);
  const [order, setOrder] = useState<CatalogOrder>("completion");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!seriesSlug) return;
    setQuery("");
    setDebounced("");
  }, [seriesSlug]);

  useEffect(() => {
    if (seriesSlug) return;
    let cancelled = false;
    setPicked(null);
    setLoading(true);
    const path = debounced
      ? `/lookup/catalog?q=${encodeURIComponent(debounced)}&order=${encodeURIComponent(order)}`
      : "/lookup/catalog";
    void props
      .fetchApi(path)
      .then(async (res) => {
        const json = (await res.json()) as { series?: CatalogSeries[]; characters?: CatalogSearchHit[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Akira couldn't load the catalog.");
          return;
        }
        setSeries(json.series ?? []);
        setHits(json.characters ?? []);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Akira couldn't load the catalog.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, seriesSlug, props.fetchApi, debounced ? order : ""]);

  useEffect(() => {
    if (!seriesSlug) return;
    let cancelled = false;
    setLoading(true);
    void props
      .fetchApi(`/lookup/series/${encodeURIComponent(seriesSlug)}`)
      .then(async (res) => {
        const json = (await res.json()) as CatalogSeriesDetail & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setPicked(null);
          setError(json.error ?? "Akira couldn't load that series.");
          return;
        }
        setPicked(json);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setPicked(null);
          setError("Akira couldn't load that series.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seriesSlug, props.fetchApi]);

  const filtered = useMemo(() => {
    if (!picked) return [] as CatalogCharacterCard[];
    const q = query.trim().toLowerCase();
    const rows = q
      ? picked.characters.filter(
          (character) => character.name.toLowerCase().includes(q) || character.slug.includes(q),
        )
      : picked.characters;
    return sortCatalogCharacters(rows, order);
  }, [picked, query, order]);

  const shownSeries = useMemo(() => sortCatalogSeries(series, order), [series, order]);
  const shownHits = useMemo(() => sortCatalogCharacters(hits, order).slice(0, 48), [hits, order]);

  async function togglePin(row: CatalogSeries) {
    if (pinning) return;
    setPinning(row.id);
    setError(null);
    try {
      const res = await props.fetchApi("/stats/tracked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId: row.id, tracked: !row.tracked }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Akira couldn't update that.");
        return;
      }
      setSeries((current) => applyCatalogTrack(current, row.id, !row.tracked, order));
    } catch {
      setError("Akira couldn't update that.");
    } finally {
      setPinning(null);
    }
  }

  const filterName = picked?.name ?? (seriesSlug ? "Series" : null);
  const countLabel = loading
    ? "…"
    : picked
      ? `${picked.percent}% · ${picked.owned} / ${picked.total}`
      : `${series.length} series`;

  return (
    <div className="catalog-page">
      <div className="collection-head">
        <h2 className="page-title">
          <span className="gradient-text">Characters</span>
        </h2>
        <p className="collection-count">{countLabel}</p>
      </div>
      {seriesSlug ? null : (
        <p className="catalog-lead">Pin a show to keep it at the top. Click a series to filter characters.</p>
      )}
      <div className="collection-tools">
        <div className="catalog-searchbar">
          {seriesSlug ? (
            <span className="catalog-filter">
              <span>{filterName}</span>
              <button
                type="button"
                aria-label={`Remove ${filterName} filter`}
                onClick={() => navigate("/characters")}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </span>
          ) : null}
          <input
            className="catalog-searchbar__input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={seriesSlug ? "Filter characters" : "Search a series or character"}
            aria-label={seriesSlug ? "Filter characters in this series" : "Search a series or character"}
          />
        </div>
        <MenuSelect
          className="collection-order"
          label="Order"
          value={order}
          options={CATALOG_ORDERS.map((option) => ({ value: option.id, label: option.label }))}
          onChange={(value) => setOrder(catalogOrder(value))}
        />
      </div>
      {error ? <p className="webui-muted">{error}</p> : null}
      {picked ? (
        <>
          <div className="catalog-grid">
            {filtered.map((character) => (
              <Poster
                key={character.id}
                to={`/characters/${picked.slug}/${character.slug}`}
                src={portraitPath(character.cover)}
                title={character.name}
                note={character.owned ? "In your collection" : character.wishlisted ? "Watching" : "Missing"}
                dim={!character.owned}
              />
            ))}
          </div>
          {!loading && !error && filtered.length === 0 ? (
            <p className="webui-muted">Nothing matched that filter.</p>
          ) : null}
        </>
      ) : seriesSlug ? null : (
        <>
          {series.length > 0 ? (
            <>
              {debounced ? <h3 className="catalog-section">Series</h3> : null}
              <div className="catalog-grid">
                {shownSeries.map((row) => (
                  <Poster
                    key={row.id}
                    to={`/characters/${row.slug}`}
                    src={row.coverUrl}
                    title={row.name}
                    percent={row.percent}
                    owned={row.owned}
                    total={row.total}
                    pinned={row.tracked}
                    pinBusy={pinning === row.id}
                    onPin={() => void togglePin(row)}
                  />
                ))}
              </div>
            </>
          ) : null}
          {debounced && shownHits.length > 0 ? (
            <>
              <h3 className="catalog-section">Characters</h3>
              <div className="catalog-grid">
                {shownHits.map((hit) => (
                  <Poster
                    key={hit.id}
                    to={`/characters/${hit.series.slug}/${hit.slug}`}
                    src={portraitPath(hit.cover)}
                    title={hit.name}
                    note={hit.series.name}
                    dim={!hit.owned}
                  />
                ))}
              </div>
            </>
          ) : null}
          {!loading && !error && series.length === 0 && hits.length === 0 ? (
            <p className="webui-muted">Nothing matched that search.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function CharacterSheet(props: {
  seriesSlug: string;
  characterSlug: string;
  fetchApi: FetchApi;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<CatalogCharacterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edition, setEdition] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEdition(0);
    void props
      .fetchApi(
        `/lookup/series/${encodeURIComponent(props.seriesSlug)}/characters/${encodeURIComponent(props.characterSlug)}`,
      )
      .then(async (res) => {
        const json = (await res.json()) as CatalogCharacterDetail & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Akira couldn't load that character.");
          return;
        }
        setData(json);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Akira couldn't load that character.");
      });
    return () => {
      cancelled = true;
    };
  }, [props.fetchApi, props.seriesSlug, props.characterSlug]);

  const current = data?.editions[edition] ?? data?.editions[0];
  const cover: CatalogCover | null = current && data
    ? { seriesSlug: data.series.slug, characterSlug: data.slug, image: current.image, v: current.v }
    : null;
  const thumbs =
    data && current
      ? data.editions.map((item) => ({
          id: item.id,
          name: item.name,
          src:
            portraitSrc({
              seriesSlug: data.series.slug,
              characterSlug: data.slug,
              image: item.image,
              v: item.v,
            }) ?? "",
        }))
      : [];
  const layout = {
    data: data!,
    current: current!,
    artSrc: portraitSrc(cover),
    thumbs,
    edition,
    setEdition,
    busy,
    onWatch: () => void toggleWatch(),
  };

  async function toggleWatch() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const res = await props.fetchApi(
        `/lookup/series/${encodeURIComponent(props.seriesSlug)}/characters/${encodeURIComponent(props.characterSlug)}/wishlist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ watching: !data.wishlisted }),
        },
      );
      const json = (await res.json()) as CatalogCharacterDetail & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Akira couldn't update that.");
        return;
      }
      setData(json);
    } catch {
      setError("Akira couldn't update that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="catalog-page">
      <p className="catalog-back">
        <button type="button" className="linkish" onClick={() => navigate(`/characters/${props.seriesSlug}`)}>
          Back to {data?.series.name ?? "Characters"}
        </button>
      </p>
      {error ? <p className="webui-muted">{error}</p> : null}
      {data && current ? <DeskLayout {...layout} /> : error ? null : (
        <p className="webui-muted">Akira is looking that up…</p>
      )}
    </div>
  );
}
