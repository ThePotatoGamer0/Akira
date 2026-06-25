import { useEffect, useState } from "react";

type Row = {
  id: string;
  name: string;
  slug: string;
  series: { name: string; slug: string };
};

export function CardPoolManager(props: {
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [seriesSlug, setSeriesSlug] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterSlug, setCharacterSlug] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await props.fetchApi("/admin/characters");
    if (res.ok) {
      const j = (await res.json()) as { characters: Row[] };
      setRows(j.characters);
    }
  }

  useEffect(() => {
    void load();
  }, [props.fetchApi]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await props.fetchApi("/admin/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seriesSlug,
        seriesName: seriesName || undefined,
        characterName,
        characterSlug,
      }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(j.error ?? "Could not add");
      return;
    }
    setMsg("Character added - run asset generation to render new cards.");
    setCharacterName("");
    setCharacterSlug("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this character from the pool?")) return;
    await props.fetchApi(`/admin/characters/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="panel">
      <h3>Card pool</h3>
      <form onSubmit={(e) => void add(e)}>
        <label>
          Series slug
          <input value={seriesSlug} onChange={(e) => setSeriesSlug(e.target.value)} placeholder="e.g. magical-girls" />
        </label>
        <label>
          Series display name (optional)
          <input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} />
        </label>
        <label>
          Character name
          <input value={characterName} onChange={(e) => setCharacterName(e.target.value)} />
        </label>
        <label>
          Character slug
          <input value={characterSlug} onChange={(e) => setCharacterSlug(e.target.value)} />
        </label>
        <button type="submit">Add character</button>
      </form>
      {msg ? <p>{msg}</p> : null}
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            {r.series.name} / {r.name}{" "}
            <button type="button" className="secondary" onClick={() => void remove(r.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
