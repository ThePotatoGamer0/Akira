import { useEffect, useId, useRef, useState } from "react";

/**
 * The dropdown under a search box. It asks the server for the best characters
 * and series while you type (`/lookup/suggest`), so the same ranking the results
 * use is what you see first. The matched words are marked in the suggestion.
 */

type FetchApi = (path: string, init?: RequestInit) => Promise<Response>;

export type Suggestion = {
  kind: "character" | "series";
  id: string;
  label: string;
  detail: string;
  href: string;
  words: string[];
};

/** Re-uses results for the same text while a player deletes and retypes. */
const CACHE_SIZE = 40;
const cache = new Map<string, Suggestion[]>();

function remembered(query: string): Suggestion[] | undefined {
  const hit = cache.get(query);
  if (!hit) return undefined;
  cache.delete(query);
  cache.set(query, hit);
  return hit;
}

function remember(query: string, suggestions: Suggestion[]): void {
  cache.set(query, suggestions);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function SearchSuggest(props: {
  fetchApi: FetchApi;
  /** What has been typed. Two or more letters are worth searching for. */
  query: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** Hidden while a series page has its own filter open. */
  enabled?: boolean;
  onPick: (suggestion: Suggestion) => void;
}) {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const host = useRef<HTMLDivElement | null>(null);
  const trimmed = props.query.trim();
  const enabled = props.enabled !== false && trimmed.length >= 2;

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setOpen(false);
      setActive(-1);
      return;
    }
    const cached = remembered(trimmed);
    if (cached) {
      setRows(cached);
      setOpen(true);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void props
        .fetchApi(`/lookup/suggest?q=${encodeURIComponent(trimmed)}`)
        .then(async (res) => (res.ok ? ((await res.json()) as { suggestions?: Suggestion[] }) : null))
        .then((json) => {
          if (cancelled || !json) return;
          const suggestions = json.suggestions ?? [];
          remember(trimmed, suggestions);
          setRows(suggestions);
          setOpen(true);
          setActive(-1);
        })
        .catch(() => {
          // A dropped suggestion request is not worth an error; the results below still load.
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, enabled, props.fetchApi]);

  // Close when the click was somewhere else, so the dropdown never covers the page.
  useEffect(() => {
    if (!open) return;
    function away(event: PointerEvent) {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  const visible = open && enabled;
  const options = visible ? rows : [];

  return (
    <div
      className="search-suggest"
      ref={host}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (!visible) return;
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActive((current) => (current + step + options.length) % options.length);
          return;
        }
        if (event.key === "Escape" && visible) {
          event.stopPropagation();
          setOpen(false);
          setActive(-1);
          return;
        }
        if (event.key === "Enter" && visible && active >= 0 && options[active]) {
          event.preventDefault();
          setOpen(false);
          props.onPick(options[active]);
        }
      }}
    >
      <input
        className={props.className}
        value={props.query}
        onChange={(event) => props.onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={props.placeholder}
        aria-label={props.ariaLabel}
        aria-autocomplete="list"
        aria-controls={visible ? listId : undefined}
        aria-expanded={visible}
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {enabled && open ? (
        <ul className="search-suggest__list" id={listId} role="listbox">
          {options.length === 0 ? (
            <li className="search-suggest__empty" role="presentation">
              Nothing matches yet. The results below still use the full search.
            </li>
          ) : null}
          {options.map((row, index) => (
            <li
              key={`${row.kind}:${row.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "search-suggest__row is-active" : "search-suggest__row"}
              onPointerDown={(event) => event.preventDefault()}
              onPointerEnter={() => setActive(index)}
              onClick={() => {
                setOpen(false);
                props.onPick(row);
                // The pick usually replaces what you typed, so drop the suggestions.
                (document.activeElement as HTMLElement | null)?.blur();
              }}
            >
              <span className={`search-suggest__kind is-${row.kind}`} aria-hidden="true">
                {row.kind === "character" ? "C" : "S"}
              </span>
              <span className="search-suggest__text">
                <span className="search-suggest__label">{markWords(row.label, row.words)}</span>
                {row.detail ? <span className="search-suggest__detail">{row.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Wrap the matching words so they stand out from the rest of the label. */
function markWords(label: string, words: string[]) {
  if (words.length === 0) return label;
  const wanted = new Set(words);
  return label.split(/(\s+)/).map((part, index) =>
    wanted.has(part) ? (
      <mark key={index} className="search-suggest__mark">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
