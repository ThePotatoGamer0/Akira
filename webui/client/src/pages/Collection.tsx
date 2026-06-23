import { useEffect, useState } from "react";
import { CollectionGrid } from "../components/collection/CollectionGrid.js";
import { CardViewer } from "../components/collection/CardViewer.js";
import type { CollectionCard, Me } from "../types/index.js";

export function CollectionPage(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [selected, setSelected] = useState<CollectionCard | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await props.fetchApi(`/collection/${props.me.id}`);
      if (res.ok) {
        const j = (await res.json()) as { cards: CollectionCard[] };
        setCards(j.cards);
      }
    })();
  }, [props.fetchApi, props.me.id]);

  return (
    <div>
      <h2 className="page-title">
        Your <span className="gradient-text">collection</span>
      </h2>
      <CardViewer card={selected} />
      <CollectionGrid cards={cards} onSelect={setSelected} />
    </div>
  );
}
