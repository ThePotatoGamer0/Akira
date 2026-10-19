import { useEffect, useState } from "react";

type FetchApi = (path: string, init?: RequestInit) => Promise<Response>;

type CardRow = {
  id: string;
  printNumber: number;
  quality: string;
  frameId: number | null;
  tag: string | null;
  alias: string | null;
  dye: string | null;
  obtainedAt: string;
  variantId: string;
  variantName: string;
  rarity: string;
  characterName: string;
  seriesName: string;
  owner: { discordId: string; discordUsername: string | null; preferredName: string | null } | null;
};

type VariantRow = {
  id: string;
  name: string;
  rarity: string;
  characterName: string;
  seriesName: string;
};

const QUALITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;

const emptyDraft = {
  variantId: "",
  quality: "COMMON",
  printNumber: "",
  owner: "",
  frameId: "",
  dye: "",
  tag: "",
  alias: "",
};

async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Akira couldn't save that.";
}

function ownerLabel(card: CardRow): string {
  return card.owner?.discordUsername ?? card.owner?.discordId ?? "no owner";
}

export function CardDesk(props: { fetchApi: FetchApi }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CardRow[]>([]);
  const [card, setCard] = useState<CardRow | null>(null);
  const [owner, setOwner] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [variantQuery, setVariantQuery] = useState("");
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [draft, setDraft] = useState(emptyDraft);

  async function search(e?: React.FormEvent, nextQuery = query) {
    e?.preventDefault();
    setMessage(null);
    const res = await props.fetchApi(`/admin/cards?q=${encodeURIComponent(nextQuery)}`);
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    const body = (await res.json()) as { cards: CardRow[] };
    setRows(body.cards);
  }

  function choose(next: CardRow) {
    setCard(next);
    setOwner(next.owner?.discordUsername ?? next.owner?.discordId ?? "");
    setMessage(null);
  }

  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    if (!card) return;
    setMessage(null);
    const res = await props.fetchApi(`/admin/cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quality: card.quality,
        printNumber: card.printNumber,
        variantId: card.variantId,
        frameId: card.frameId ?? "",
        dye: card.dye ?? "",
        tag: card.tag ?? "",
        alias: card.alias ?? "",
        owner,
      }),
    });
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    const body = (await res.json()) as { card: CardRow };
    choose(body.card);
    setMessage("Card saved.");
    await search();
  }

  async function removeCard() {
    if (!card) return;
    if (!confirm(`Delete card ${card.id}?`)) return;
    const res = await props.fetchApi(`/admin/cards/${card.id}`, { method: "DELETE" });
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    setCard(null);
    setMessage("Card deleted.");
    await search();
  }

  async function findVariants(e: React.FormEvent) {
    e.preventDefault();
    const res = await props.fetchApi(`/admin/cards/variants?q=${encodeURIComponent(variantQuery)}`);
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    const body = (await res.json()) as { variants: VariantRow[] };
    setVariants(body.variants);
  }

  async function createCard(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await props.fetchApi("/admin/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    const body = (await res.json()) as { card: CardRow };
    setDraft(emptyDraft);
    choose(body.card);
    setMessage(`Card ${body.card.id} created.`);
    setQuery(body.card.id);
    await search(undefined, body.card.id);
  }

  useEffect(() => {
    void search();
  }, []);

  return (
    <div>
      {message ? <p className="admin-note" role="status">{message}</p> : null}
      <div className="panel">
        <h3>Find a card</h3>
        <form onSubmit={(e) => void search(e)}>
          <label>
            Code, character, or owner
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="submit">Search</button>
        </form>
        {rows.map((row) => (
          <button key={row.id} type="button" className="admin-pick" onClick={() => choose(row)}>
            <span>
              {row.characterName} · {row.id}
            </span>
            <span className="admin-meta">
              {row.quality} #{row.printNumber} · {ownerLabel(row)}
            </span>
          </button>
        ))}
      </div>

      {card ? (
        <div className="panel">
          <h3>
            {card.characterName} <span className="admin-meta">{card.id}</span>
          </h3>
          <p className="admin-meta">
            {card.seriesName} · {card.variantName} · {card.rarity}
          </p>
          <form onSubmit={(e) => void saveCard(e)}>
            <div className="admin-grid">
              <label>
                Quality
                <select value={card.quality} onChange={(e) => setCard({ ...card, quality: e.target.value })}>
                  {QUALITIES.map((quality) => (
                    <option key={quality} value={quality}>
                      {quality}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Print
                <input
                  type="number"
                  value={card.printNumber}
                  onChange={(e) => setCard({ ...card, printNumber: Number(e.target.value) })}
                />
              </label>
              <label>
                Edition id
                <input value={card.variantId} onChange={(e) => setCard({ ...card, variantId: e.target.value })} />
              </label>
              <label>
                Frame id
                <input
                  value={card.frameId ?? ""}
                  onChange={(e) => setCard({ ...card, frameId: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="Empty uses the server frame"
                />
              </label>
              <label>
                Owner
                <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Username or Discord id" />
              </label>
              <label>
                Tag
                <input value={card.tag ?? ""} onChange={(e) => setCard({ ...card, tag: e.target.value || null })} />
              </label>
              <label>
                Dye
                <input value={card.dye ?? ""} onChange={(e) => setCard({ ...card, dye: e.target.value || null })} />
              </label>
              <label>
                Alias
                <input value={card.alias ?? ""} onChange={(e) => setCard({ ...card, alias: e.target.value || null })} />
              </label>
            </div>
            <button type="submit">Save card</button>
            <button type="button" className="secondary" onClick={() => void removeCard()}>
              Delete card
            </button>
          </form>
        </div>
      ) : null}

      <div className="panel">
        <h3>Add a card</h3>
        <form onSubmit={(e) => void findVariants(e)}>
          <label>
            Find an edition
            <input
              value={variantQuery}
              onChange={(e) => setVariantQuery(e.target.value)}
              placeholder="Character, series, or edition id"
            />
          </label>
          <button type="submit" className="secondary">
            Find editions
          </button>
        </form>
        {variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            className="admin-pick"
            onClick={() => setDraft({ ...draft, variantId: variant.id })}
          >
            <span>
              {variant.characterName} · {variant.name}
            </span>
            <span className="admin-meta">
              {variant.seriesName} · {variant.id}
            </span>
          </button>
        ))}
        <form onSubmit={(e) => void createCard(e)}>
          <div className="admin-grid">
            <label>
              Edition id
              <input value={draft.variantId} onChange={(e) => setDraft({ ...draft, variantId: e.target.value })} />
            </label>
            <label>
              Quality
              <select value={draft.quality} onChange={(e) => setDraft({ ...draft, quality: e.target.value })}>
                {QUALITIES.map((quality) => (
                  <option key={quality} value={quality}>
                    {quality}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Print
              <input
                value={draft.printNumber}
                onChange={(e) => setDraft({ ...draft, printNumber: e.target.value })}
                placeholder="Empty uses the next print"
              />
            </label>
            <label>
              Owner
              <input
                value={draft.owner}
                onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
                placeholder="Empty leaves it unowned"
              />
            </label>
            <label>
              Frame id
              <input value={draft.frameId} onChange={(e) => setDraft({ ...draft, frameId: e.target.value })} />
            </label>
            <label>
              Dye
              <input value={draft.dye} onChange={(e) => setDraft({ ...draft, dye: e.target.value })} />
            </label>
            <label>
              Tag
              <input value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} />
            </label>
            <label>
              Alias
              <input value={draft.alias} onChange={(e) => setDraft({ ...draft, alias: e.target.value })} />
            </label>
          </div>
          <button type="submit">Create card</button>
        </form>
      </div>

    </div>
  );
}
