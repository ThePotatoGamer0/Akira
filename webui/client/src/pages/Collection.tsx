import { useCallback, useEffect, useRef, useState } from "react";
import { CardOverlay } from "../components/collection/CardOverlay.js";
import { CollectionGrid } from "../components/collection/CollectionGrid.js";
import { TagMenu } from "../components/collection/TagMenu.js";
import type { CollectionCard, CollectionSlice, CollectionStudio, Me } from "../types/index.js";

const EMPTY_STUDIO: CollectionStudio = { serverFrame: 0, frames: [0], tags: [] };
const BATCH = 16;
const PAGE_SIZE = 32;

const COLLECTION_ORDERS = [
  { id: "character", label: "Character name" },
  { id: "series", label: "Series, then character" },
  { id: "quality", label: "Quality" },
  { id: "tag", label: "Tag, then character" },
] as const;

type CollectionOrder = (typeof COLLECTION_ORDERS)[number]["id"];

function slicePath(userId: string, offset: number, limit: number, q: string, order: CollectionOrder): string {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit), order });
  if (q) params.set("q", q);
  return `/collection/${userId}?${params.toString()}`;
}

function pageWindow(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index);
  const wanted = [0, count - 1, current - 1, current, current + 1].filter((page) => page >= 0 && page < count);
  const sorted = [...new Set(wanted)].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (const page of sorted) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && page - previous > 1) items.push("gap");
    items.push(page);
  }
  return items;
}

export function CollectionPage(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [studio, setStudio] = useState<CollectionStudio>(EMPTY_STUDIO);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [burnedCard, setBurnedCard] = useState<CollectionCard | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [tagChoice, setTagChoice] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [burnQuote, setBurnQuote] = useState<{ awarded: number; skipped: number; count: number } | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ q: "", page: 0, order: "character" as CollectionOrder });
  const [total, setTotal] = useState(0);
  const [owned, setOwned] = useState(0);
  const [counted, setCounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const busy = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const skipScroll = useRef(true);
  const live = useRef({ page: 0, q: "", order: "character" as CollectionOrder, count: 0, total: 0, loading: true });

  const loadStudio = useCallback(async () => {
    const res = await props.fetchApi(`/collection/${props.me.id}/studio`);
    if (!res.ok) return;
    setStudio((await res.json()) as CollectionStudio);
  }, [props.fetchApi, props.me.id]);

  const readSlice = useCallback(
    async (offset: number, limit: number, q: string, order: CollectionOrder): Promise<CollectionSlice | null> => {
      const res = await props.fetchApi(slicePath(props.me.id, offset, limit, q, order));
      if (!res.ok) return null;
      return (await res.json()) as CollectionSlice;
    },
    [props.fetchApi, props.me.id],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = query.trim();
      setSearch((current) => (current.q === next ? current : { ...current, q: next, page: 0 }));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    void loadStudio();
  }, [loadStudio]);

  useEffect(() => {
    const ticket = ++epoch.current;
    let cancelled = false;
    busy.current = true;
    setLoading(true);
    setError(null);
    setCards([]);
    void (async () => {
      const json = await readSlice(search.page * PAGE_SIZE, BATCH, search.q, search.order);
      if (cancelled || ticket !== epoch.current) return;
      if (!json) {
        setError("Akira couldn't load that page.");
        busy.current = false;
        setLoading(false);
        return;
      }
      const lastPage = Math.max(0, Math.ceil(json.total / PAGE_SIZE) - 1);
      if (search.page > lastPage) {
        setSearch((current) => (current.page === search.page && current.q === search.q ? { ...current, page: lastPage } : current));
        return;
      }
      setCards(json.cards);
      setTotal(json.total);
      setOwned(json.owned);
      setCounted(true);
      busy.current = false;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [readSlice, search.page, search.q, search.order]);

  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    headRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [search.page, search.q, search.order]);

  live.current = { page: search.page, q: search.q, order: search.order, count: cards.length, total, loading };

  const loadMore = useCallback(async () => {
    const snap = live.current;
    if (snap.loading || busy.current) return;
    const start = snap.page * PAGE_SIZE;
    const room = Math.min(PAGE_SIZE, Math.max(0, snap.total - start)) - snap.count;
    if (room <= 0) return;
    const ticket = epoch.current;
    busy.current = true;
    setLoading(true);
    const json = await readSlice(start + snap.count, Math.min(BATCH, room), snap.q, snap.order);
    if (ticket !== epoch.current) return;
    if (!json) {
      setError("Akira couldn't load more cards.");
      busy.current = false;
      setLoading(false);
      return;
    }
    setCards((current) => {
      const seen = new Set(current.map((card) => card.id));
      return [...current, ...json.cards.filter((card) => !seen.has(card.id))];
    });
    setTotal(json.total);
    setOwned(json.owned);
    setCounted(true);
    busy.current = false;
    setLoading(false);
  }, [readSlice]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shownOnPage = Math.min(PAGE_SIZE, Math.max(0, total - search.page * PAGE_SIZE));
  const hasMore = cards.length > 0 && cards.length < shownOnPage && !error;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, cards.length]);

  const close = useCallback(() => {
    setSelectedId(null);
    setBurnedCard(null);
  }, []);
  const selected = cards.find((card) => card.id === selectedId) ?? (burnedCard?.id === selectedId ? burnedCard : null);

  function saveCard(cardId: string, patch: Partial<CollectionCard>) {
    setCards((current) => current.map((card) => (card.id === cardId ? { ...card, ...patch } : card)));
  }

  async function refreshTags() {
    await loadStudio();
    const ticket = epoch.current;
    const json = await readSlice(search.page * PAGE_SIZE, Math.max(cards.length, BATCH), search.q, search.order);
    if (!json || ticket !== epoch.current) return;
    setCards(json.cards);
    setTotal(json.total);
    setOwned(json.owned);
    setCounted(true);
  }

  function leaveSelect() {
    setSelecting(false);
    setSelectedIds(new Set());
    setBurnQuote(null);
    setTagChoice("");
    setActionError(null);
  }

  function toggleSelected(card: CollectionCard) {
    setBurnQuote(null);
    setActionNote(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(card.id)) next.delete(card.id);
      else if (next.size < 100) next.add(card.id);
      return next;
    });
  }

  function selectLoaded() {
    setBurnQuote(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const card of cards) {
        if (next.size >= 100) break;
        next.add(card.id);
      }
      return next;
    });
  }

  function dropCards(ids: string[]) {
    const gone = new Set(ids);
    setCards((current) => current.filter((card) => !gone.has(card.id)));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
    setOwned((count) => Math.max(0, count - ids.length));
    const nextTotal = Math.max(0, total - ids.length);
    setTotal(nextTotal);
    const lastPage = Math.max(0, Math.ceil(nextTotal / PAGE_SIZE) - 1);
    setSearch((current) => (current.page > lastPage ? { ...current, page: lastPage } : current));
  }

  function rememberBurn(cardId: string) {
    const card = cards.find((item) => item.id === cardId);
    if (card) setBurnedCard(card);
    dropCards([cardId]);
  }

  async function applySelectionTag() {
    if (!tagChoice || selectedIds.size === 0) return;
    const cardIds = [...selectedIds];
    const clearing = tagChoice === "__clear";
    setActionBusy("tag");
    setActionError(null);
    setActionNote(null);
    try {
      const res = await props.fetchApi(`/collection/${props.me.id}/tag-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: clearing ? null : tagChoice, cardIds }),
      });
      const json = (await res.json()) as { tag?: string | null; tagEmoji?: string; error?: string };
      if (!res.ok || !("tag" in json)) {
        setActionError(json.error ?? "Akira couldn't tag those cards.");
        return;
      }
      const tagged = new Set(cardIds);
      setCards((current) =>
        current.map((card) => (tagged.has(card.id) ? { ...card, tag: json.tag ?? null, tagEmoji: json.tagEmoji } : card)),
      );
      await loadStudio();
      setActionNote(clearing ? `Removed the tag from ${cardIds.length === 1 ? "that card" : `${cardIds.length} cards`}.` : `Tagged ${cardIds.length === 1 ? "that card" : `${cardIds.length} cards`}.`);
      setSelectedIds(new Set());
      setTagChoice("");
    } catch {
      setActionError("Akira couldn't tag those cards.");
    } finally {
      setActionBusy(null);
    }
  }

  async function askSelectionBurn() {
    const cardIds = [...selectedIds];
    if (cardIds.length === 0) return;
    setActionBusy("quote");
    setActionError(null);
    setActionNote(null);
    try {
      const res = await props.fetchApi(`/collection/${props.me.id}/burn-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds }),
      });
      const json = (await res.json()) as { burning?: string[]; awarded?: number; skipped?: number; error?: string };
      if (!res.ok || !json.burning || typeof json.awarded !== "number") {
        setError(null);
        setActionError(json.error ?? "Akira couldn't price that burn.");
        return;
      }
      setBurnQuote({ awarded: json.awarded, skipped: json.skipped ?? 0, count: json.burning.length });
    } catch {
      setActionError("Akira couldn't price that burn.");
    } finally {
      setActionBusy(null);
    }
  }

  async function confirmSelectionBurn() {
    const cardIds = [...selectedIds];
    if (cardIds.length === 0) return;
    setActionBusy("burn");
    setActionError(null);
    try {
      const res = await props.fetchApi(`/collection/${props.me.id}/burn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds }),
      });
      const json = (await res.json()) as { burning?: string[]; awarded?: number; error?: string };
      if (!res.ok || !json.burning || typeof json.awarded !== "number") {
        setActionError(json.error ?? "Akira couldn't burn those cards.");
        return;
      }
      dropCards(json.burning);
      const count = json.burning.length;
      setActionNote(`Akira burned ${count} ${count === 1 ? "card" : "cards"} and tucked ${json.awarded} bits away.`);
      setBurnQuote(null);
    } catch {
      setActionError("Akira couldn't burn those cards.");
    } finally {
      setActionBusy(null);
    }
  }

  function goToPage(page: number) {
    setSearch((current) => ({ ...current, page }));
  }

  const countLabel = search.q
    ? `${total} of ${owned} ${owned === 1 ? "card" : "cards"}`
    : `${owned} ${owned === 1 ? "card" : "cards"}`;

  return (
    <div className="collection-page">
      <div className="collection-head" ref={headRef}>
        <h2 className="page-title">
          Your <span className="gradient-text">collection</span>
        </h2>
        <p className="collection-count">{counted ? countLabel : "…"}</p>
      </div>
      <div className="collection-tools">
        <input
          className="collection-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, series, tag, or card code"
          aria-label="Search your collection"
        />
        <select
          className="collection-order"
          value={search.order}
          aria-label="Order"
          onChange={(event) => {
            const order = event.target.value as CollectionOrder;
            setSearch((current) => (current.order === order ? current : { ...current, order, page: 0 }));
          }}
        >
          {COLLECTION_ORDERS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="button" className="secondary collection-tags" onClick={() => setTagsOpen(true)}>
          Tags
        </button>
        <button
          type="button"
          className={selecting ? "collection-tags" : "secondary collection-tags"}
          aria-pressed={selecting}
          onClick={() => (selecting ? leaveSelect() : setSelecting(true))}
        >
          {selecting ? "Done" : "Select"}
        </button>
      </div>
      {actionNote ? <p className="collection-note">{actionNote}</p> : null}
      {actionError ? <p className="webui-alert">{actionError}</p> : null}
      {error ? <p className="webui-alert">{error}</p> : null}
      {cards.length === 0 ? (
        <p className="webui-muted collection-pending">
          {loading ? "Akira is looking through your cards…" : search.q ? "No cards match." : "No cards yet."}
        </p>
      ) : (
        <CollectionGrid
          cards={cards}
          selecting={selecting}
          selectedIds={selectedIds}
          onSelect={(card) => setSelectedId(card.id)}
          onToggle={toggleSelected}
        />
      )}
      {hasMore ? <div ref={sentinelRef} className="collection-sentinel" /> : null}
      {cards.length > 0 && loading ? <p className="webui-muted collection-pending">Loading more cards…</p> : null}
      {pageCount > 1 ? (
        <nav className="collection-pager" aria-label="Collection pages">
          <button type="button" className="secondary" disabled={search.page === 0} onClick={() => goToPage(search.page - 1)}>
            Prev
          </button>
          {pageWindow(search.page, pageCount).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="collection-pager__gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === search.page ? undefined : "secondary"}
                aria-current={item === search.page ? "page" : undefined}
                onClick={() => goToPage(item)}
              >
                {item + 1}
              </button>
            ),
          )}
          <button
            type="button"
            className="secondary"
            disabled={search.page >= pageCount - 1}
            onClick={() => goToPage(search.page + 1)}
          >
            Next
          </button>
          <span className="collection-pager__status">
            Page {search.page + 1} of {pageCount}
          </span>
        </nav>
      ) : null}
      {selecting ? (
        <div className="collection-actions">
          <p className="collection-actions__count">
            {selectedIds.size} selected
            {selectedIds.size >= 100 ? " · 100 is the most at once" : ""}
          </p>
          <button type="button" className="secondary" disabled={cards.length === 0 || actionBusy !== null} onClick={selectLoaded}>
            Select these
          </button>
          <button type="button" className="secondary" disabled={selectedIds.size === 0 || actionBusy !== null} onClick={() => setSelectedIds(new Set())}>
            Clear
          </button>
          <select
            className="collection-order"
            aria-label="Tag for the selected cards"
            value={tagChoice}
            disabled={actionBusy !== null}
            onChange={(event) => setTagChoice(event.target.value)}
          >
            <option value="">Tag…</option>
            <option value="__clear">Remove tag</option>
            {studio.tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.emoji} {tag.name}
              </option>
            ))}
          </select>
          <button type="button" className="secondary" disabled={!tagChoice || selectedIds.size === 0 || actionBusy !== null} onClick={() => void applySelectionTag()}>
            {actionBusy === "tag" ? "Tagging…" : "Apply tag"}
          </button>
          {burnQuote ? (
            <div className="collection-actions__confirm">
              <p>
                Burn {burnQuote.count} {burnQuote.count === 1 ? "card" : "cards"} for {burnQuote.awarded} bits? This can't be undone.
                {burnQuote.count > 1 ? " A batch pays the plain rates." : ""}
                {burnQuote.skipped > 0
                  ? ` ${burnQuote.skipped} ${burnQuote.skipped === 1 ? "card stays" : "cards stay"} put. ${burnQuote.skipped === 1 ? "It's" : "They're"} in an open trade.`
                  : ""}
              </p>
              <button type="button" className="danger" disabled={actionBusy !== null} onClick={() => void confirmSelectionBurn()}>
                {actionBusy === "burn" ? "Burning…" : "Burn them"}
              </button>
              <button type="button" className="secondary" disabled={actionBusy !== null} onClick={() => setBurnQuote(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="danger" disabled={selectedIds.size === 0 || actionBusy !== null} onClick={() => void askSelectionBurn()}>
              {actionBusy === "quote" ? "Checking…" : "Burn"}
            </button>
          )}
        </div>
      ) : null}
      {selected ? (
        <CardOverlay
          key={selected.id}
          card={selected}
          studio={studio}
          canEdit
          userId={props.me.id}
          fetchApi={props.fetchApi}
          onClose={close}
          onSaved={saveCard}
          onBurned={rememberBurn}
        />
      ) : null}
      {tagsOpen ? (
        <TagMenu
          tags={studio.tags}
          userId={props.me.id}
          fetchApi={props.fetchApi}
          onClose={() => setTagsOpen(false)}
          onChanged={refreshTags}
        />
      ) : null}
    </div>
  );
}
