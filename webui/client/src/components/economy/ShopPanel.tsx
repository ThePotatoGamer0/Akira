import { useEffect, useState } from "react";
import type { ShopItem } from "../../types/index.js";

export function ShopPanel(props: {
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  onBought?: () => void;
}) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await props.fetchApi("/economy/shop");
      if (res.ok) {
        const j = (await res.json()) as { items: ShopItem[] };
        setItems(j.items);
      }
    })();
  }, [props.fetchApi]);

  async function buy(id: string) {
    setMsg(null);
    const res = await props.fetchApi("/economy/shop/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id }),
    });
    const j = (await res.json()) as { error?: string; name?: string; seriesName?: string | null };
    if (!res.ok) {
      setMsg(j.error ?? "Could not purchase");
      return;
    }
    const series = j.seriesName ? ` ${j.seriesName} stays locked.` : "";
    setMsg(`Bought ${j.name}.${series}`);
    props.onBought?.();
  }

  return (
    <div className="panel">
      <h3>Shop</h3>
      <div className="shop-grid">
        {items.map((item) => (
          <article key={item.id} className="shop-card">
            <h4>{item.name}</h4>
            <p>{item.description}</p>
            <p className="shop-card__meta">
              {item.durationHours} hours · {item.priceBits.toLocaleString()} bits
            </p>
            <button type="button" onClick={() => void buy(item.id)}>
              Buy
            </button>
          </article>
        ))}
      </div>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
