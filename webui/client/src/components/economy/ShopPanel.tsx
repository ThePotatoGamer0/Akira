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
    const j = (await res.json()) as { error?: string; name?: string };
    if (!res.ok) {
      setMsg(j.error ?? "Could not purchase");
      return;
    }
    setMsg(`Akira tucked ${j.name} into your inventory.`);
    props.onBought?.();
  }

  return (
    <div className="panel">
      <h3>Shop</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((i) => (
          <li key={i.id} style={{ marginBottom: "0.75rem" }}>
            <strong>{i.name}</strong> — {i.priceBits} bits
            <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>{i.description}</div>
            <button type="button" onClick={() => void buy(i.id)} style={{ marginTop: "0.35rem" }}>
              Buy
            </button>
          </li>
        ))}
      </ul>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
