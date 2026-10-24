import { useCallback, useEffect, useRef, useState } from "react";
import { CardOverlay } from "../components/collection/CardOverlay.js";
import { CollectionGrid } from "../components/collection/CollectionGrid.js";
import { TagMenu } from "../components/collection/TagMenu.js";
import { NappingNotice } from "../components/NappingNotice.js";
import { MenuSelect } from "../components/MenuSelect.js";
import { COLLECTION_ORDERS, collectionOrder, type CollectionOrder } from "../lib/collectionView.js";
import { studioFrames } from "../lib/frames.js";
import type { CollectionCard, CollectionSlice, CollectionStudio, Me } from "../types/index.js";

const EMPTY_STUDIO: CollectionStudio = { serverFrame: 0, personalFrame: null, frames: [{ id: 0, name: "Dark" }], tags: [] };
const BATCH = 16;
const PAGE_SIZE = 32;

type CollectionPlayer = { id: string; name: string };

function possessive(name: string): string {
  return `${name}'s`;
}

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
  liveRev?: number;
}) {
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [studio, setStudio] = useState<CollectionStudio>(EMPTY_STUDIO);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [burnedCard, setBurnedCard] = useState<CollectionCard | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [tagChoice, setTagChoice] = useState("");
  const [framePick, setFramePick] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [burnQuote, setBurnQuote] = useState<{ awarded: number; skipped: number; count: number } | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [viewedId, setViewedId] = useState(props.me.id);
  const [players, setPlayers] = useState<CollectionPlayer[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ q: "", page: 0, order: collectionOrder(props.me.collectionOrder) });
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
  const continuous = props.me.continuousScroll === true;
  const live = useRef({ page: 0, q: "", order: collectionOrder(props.me.collectionOrder), count: 0, total: 0, loading: true, continuous });

  const loadStudio = useCallback(async () => {
    const res = await props.fetchApi(`/collection/${props.me.id}/studio`);
    if (!res.ok) return;
    const json = (await res.json()) as CollectionStudio;
    setStudio({ ...json, frames: studioFrames(json.frames) });
  }, [props.fetchApi, props.me.id]);

  const readSlice = useCallback(
    async (offset: number, limit: number, q: string, order: CollectionOrder): Promise<CollectionSlice | null> => {
      const res = await props.fetchApi(slicePath(viewedId, offset, limit, q, order));
      if (!res.ok) return null;
      return (await res.json()) as CollectionSlice;
    },
    [props.fetchApi, viewedId],
  );

  const viewingSelf = viewedId === props.me.id;
  const viewedName = players.find((player) => player.id === viewedId)?.name ?? props.me.displayName;

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = query.trim();
      setSearch((current) => (current.q === next ? current : { ...current, q: next, page: 0 }));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!viewingSelf) return;
    void loadStudio();
  }, [loadStudio, viewingSelf]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await props.fetchApi("/collection/players");
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { players?: CollectionPlayer[] };
      if (!cancelled && Array.isArray(json.players)) setPlayers(json.players);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.fetchApi]);

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

  live.current = { page: search.page, q: search.q, order: search.order, count: cards.length, total, loading, continuous };

  useEffect(() => {
    if (!props.liveRev || live.current.loading || busy.current) return;
    let cancelled = false;
    void (async () => {
      const snap = live.current;
      const start = snap.continuous ? 0 : snap.page * PAGE_SIZE;
      const take = Math.max(snap.count, BATCH);
      const json = await readSlice(start, take, snap.q, snap.order);
      if (cancelled || !json) return;
      setCards(json.cards);
      setTotal(json.total);
      setOwned(json.owned);
      setCounted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.liveRev, readSlice]);

  const loadMore = useCallback(async () => {
    const snap = live.current;
    if (snap.loading || busy.current) return;
    const start = snap.continuous ? 0 : snap.page * PAGE_SIZE;
    const cap = snap.continuous ? snap.total : Math.min(PAGE_SIZE, Math.max(0, snap.total - start));
    const room = cap - snap.count;
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
  const shownOnPage = continuous ? total : Math.min(PAGE_SIZE, Math.max(0, total - search.page * PAGE_SIZE));
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
    setFramePick("");
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

  function assetsFor(card: CollectionCard, frameId: number): CollectionCard["assets"] {
    const dye = card.dye && /^[a-zA-Z0-9_-]+$/.test(card.dye) ? card.dye : "none";
    const base = `/api/static/cards/${card.variant.id}/${frameId}/p${card.printNumber}/${dye}`;
    return { normal: `${base}/normal.png`, shiny: `${base}/shiny.apng`, burn: `${base}/burn.apng` };
  }

  async function applySelectionFrame() {
    if (!framePick || selectedIds.size === 0) return;
    const cardIds = [...selectedIds];
    const clearing = framePick === "__default";
    const frameId = clearing ? null : Number(framePick);
    if (frameId !== null && !Number.isInteger(frameId)) return;
    setActionBusy("frame");
    setActionError(null);
    setActionNote(null);
    try {
      const res = await props.fetchApi(`/collection/${props.me.id}/frame-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameId, cardIds }),
      });
      const json = (await res.json()) as { frameChoice?: number | null; frameId?: number; cardIds?: string[]; error?: string };
      if (!res.ok || typeof json.frameId !== "number" || !json.cardIds) {
        setActionError(json.error ?? "Akira couldn't frame those cards.");
        return;
      }
      const chosen = new Set(json.cardIds);
      const drawn = json.frameId;
      setCards((current) =>
        current.map((card) =>
          chosen.has(card.id)
            ? { ...card, frameChoice: json.frameChoice ?? null, frameId: drawn, assets: assetsFor(card, drawn) }
            : card,
        ),
      );
      const count = json.cardIds.length;
      const fallback = studio.personalFrame === null ? "the server frame" : "your frame";
      setActionNote(
        clearing
          ? `${count === 1 ? "That card uses" : `${count} cards use`} ${fallback} again.`
          : `Framed ${count === 1 ? "that card" : `${count} cards`}.`,
      );
      setSelectedIds(new Set());
      setFramePick("");
    } catch {
      setActionError("Akira couldn't frame those cards.");
    } finally {
      setActionBusy(null);
    }
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
  const napping = Boolean(error && cards.length === 0 && !loading);

  return (
    <div className="collection-page">
      <div className="collection-head" ref={headRef}>
        <h2 className="page-title">
          <MenuSelect
            variant="heading"
            label="Choose whose collection"
            value={viewedId}
            display={viewingSelf ? "Your" : possessive(viewedName)}
            options={(players.some((player) => player.id === props.me.id)
              ? players
              : [{ id: props.me.id, name: props.me.displayName }, ...players]
            ).map((player) => ({
              value: player.id,
              label: player.id === props.me.id ? "Your collection" : `${possessive(player.name)} collection`,
            }))}
            onChange={(id) => {
              setViewedId(id);
              setSelecting(false);
              setSelectedIds(new Set());
              setSelectedId(null);
              setSearch((current) => ({ ...current, page: 0 }));
            }}
          />{" "}
          <span className="gradient-text">collection</span>
        </h2>
        <p className="collection-count">{napping ? "" : counted ? countLabel : "…"}</p>
      </div>
      {napping ? null : (
      <div className="collection-tools">
        <input
          className="collection-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, series, tag, or card code"
          aria-label={viewingSelf ? "Search your collection" : `Search ${possessive(viewedName)} collection`}
        />
        <MenuSelect
          className="collection-order"
          label="Order"
          value={search.order}
          options={COLLECTION_ORDERS.map((option) => ({ value: option.id, label: option.label }))}
          onChange={(order) => {
            const next = order as CollectionOrder;
            setSearch((current) => (current.order === next ? current : { ...current, order: next, page: 0 }));
          }}
        />
        {viewingSelf ? (
          <button type="button" className="secondary collection-tags" onClick={() => setTagsOpen(true)}>
            Tags
          </button>
        ) : null}
        {viewingSelf ? (
          <button
            type="button"
            className={selecting ? "collection-tags" : "secondary collection-tags"}
            aria-pressed={selecting}
            onClick={() => (selecting ? leaveSelect() : setSelecting(true))}
          >
            {selecting ? "Done" : "Select"}
          </button>
        ) : null}
      </div>
      )}
      {napping ? (
        <NappingNotice
          body={
            viewingSelf
              ? "Your binder is with her. Peek back in a moment?"
              : "That binder is with her. Peek back in a moment?"
          }
        />
      ) : (
      <>
      {actionNote ? <p className="collection-note">{actionNote}</p> : null}
      {actionError ? <p className="collection-note" role="alert">{actionError}</p> : null}
      {cards.length === 0 ? (
        <p className="webui-muted collection-pending">
          {loading
            ? viewingSelf
              ? "Akira is looking through your cards…"
              : "Akira is looking through their cards…"
            : search.q
              ? "No cards match."
              : "No cards yet."}
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
      {!continuous && pageCount > 1 ? (
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
      {selecting && viewingSelf ? (
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
          <MenuSelect
            className="collection-order"
            label="Tag for the selected cards"
            value={tagChoice}
            disabled={actionBusy !== null}
            options={[
              { value: "", label: "Tag…" },
              { value: "__clear", label: "Remove tag" },
              ...studio.tags.map((tag) => ({ value: tag.name, label: `${tag.emoji} ${tag.name}` })),
            ]}
            onChange={setTagChoice}
          />
          <button type="button" className="secondary" disabled={!tagChoice || selectedIds.size === 0 || actionBusy !== null} onClick={() => void applySelectionTag()}>
            {actionBusy === "tag" ? "Tagging…" : "Apply tag"}
          </button>
          <MenuSelect
            className="collection-order"
            label="Frame for the selected cards"
            value={framePick}
            disabled={actionBusy !== null}
            options={[
              { value: "", label: "Frame…" },
              { value: "__default", label: studio.personalFrame === null ? "Server frame" : "Your frame" },
              ...studio.frames.map((frame) => ({ value: String(frame.id), label: frame.name })),
            ]}
            onChange={setFramePick}
          />
          <button type="button" className="secondary" disabled={!framePick || selectedIds.size === 0 || actionBusy !== null} onClick={() => void applySelectionFrame()}>
            {actionBusy === "frame" ? "Framing…" : "Apply frame"}
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
          canEdit={viewingSelf}
          userId={viewedId}
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
      </>
      )}
    </div>
  );
}
