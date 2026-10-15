import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TagMark } from "../marks.js";
import type { CollectionStudio } from "../../types/index.js";

export function TagMenu(props: {
  tags: CollectionStudio["tags"];
  userId: string;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
    panelRef.current?.focus();
  }, []);

  async function createTag() {
    setBusy("create");
    setError(null);
    try {
      const res = await props.fetchApi(`/collection/${props.userId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emoji }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Akira couldn't create that tag.");
        return;
      }
      setName("");
      setEmoji("");
      await props.onChanged();
    } catch {
      setError("Akira couldn't create that tag.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteTag(tagName: string) {
    setBusy(tagName);
    setError(null);
    try {
      const res = await props.fetchApi(`/collection/${props.userId}/tags/${encodeURIComponent(tagName)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Akira couldn't delete that tag.");
        return;
      }
      setPending(null);
      await props.onChanged();
    } catch {
      setError("Akira couldn't delete that tag.");
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div className="tag-menu" role="dialog" aria-modal="true" aria-labelledby="tag-menu-title">
      <button type="button" className="tag-menu__backdrop" aria-label="Close tags" onClick={props.onClose} />
      <div className="tag-menu__panel" ref={panelRef} tabIndex={-1}>
        <div className="tag-menu__head">
          <h2 id="tag-menu-title">Tags</h2>
          <button type="button" className="secondary" onClick={props.onClose}>
            Close
          </button>
        </div>
        <p className="tag-menu__note">A tag is a name and an emoji. Put it on a card from that card.</p>
        {props.tags.length === 0 ? (
          <p className="webui-muted">No tags yet.</p>
        ) : (
          <ul className="tag-menu__list">
            {props.tags.map((tag) => {
              const confirming = pending === tag.name;
              return (
                <li key={tag.name} className="tag-menu__row">
                  <TagMark emoji={tag.emoji} size={16} />
                  <span className="tag-menu__name">{tag.name}</span>
                  <span className="tag-menu__count">
                    {tag.count} {tag.count === 1 ? "card" : "cards"}
                  </span>
                  {confirming ? (
                    <div className="tag-menu__confirm">
                      <p>Cards with this tag become untagged.</p>
                      <button type="button" disabled={busy !== null} onClick={() => void deleteTag(tag.name)}>
                        {busy === tag.name ? "Deleting…" : "Delete tag"}
                      </button>
                      <button type="button" className="secondary" disabled={busy !== null} onClick={() => setPending(null)}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() => setPending(tag.name)}
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="tag-create"
          onSubmit={(event) => {
            event.preventDefault();
            void createTag();
          }}
        >
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="fav" />
          </label>
          <label>
            Emoji
            <input value={emoji} onChange={(event) => setEmoji(event.target.value)} placeholder="one emoji" />
          </label>
          <button type="submit" disabled={busy !== null || !name.trim() || !emoji.trim()}>
            {busy === "create" ? "Creating…" : "Create tag"}
          </button>
        </form>
        {error ? (
          <p className="card-overlay__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
