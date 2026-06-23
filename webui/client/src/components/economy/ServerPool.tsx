import { useEffect, useState } from "react";

type PoolState = {
  totalBits: number;
  tierReached: number;
  nextTierThreshold: number | null;
  rollChanceNextReset: number;
  activeBuff: string | null;
  buffTier: number;
  buffExpiry: string | null;
};

export function ServerPool(props: {
  bits: number;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  onChange?: () => void;
}) {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [contribute, setContribute] = useState(50);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await props.fetchApi("/economy/pool");
    if (res.ok) setPool((await res.json()) as PoolState);
  }

  useEffect(() => {
    void load();
  }, [props.fetchApi]);

  async function send() {
    setMsg(null);
    const res = await props.fetchApi("/economy/pool/contribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bits: contribute }),
    });
    const j = (await res.json()) as { error?: string; poolTotal?: number };
    if (!res.ok) {
      setMsg(j.error ?? "Could not contribute");
      return;
    }
    setMsg(`Pool is now ${j.poolTotal?.toLocaleString() ?? "?"} bits. Thanks for chipping in!`);
    await load();
    props.onChange?.();
  }

  if (!pool) return <p>Loading pool…</p>;

  return (
    <div className="panel">
      <h3>Server pool</h3>
      <p>
        Today&apos;s pool sits at <strong>{pool.totalBits.toLocaleString()}</strong> bits (tier{" "}
        {pool.tierReached} reached).
        {pool.nextTierThreshold
          ? ` Next threshold: ${pool.nextTierThreshold.toLocaleString()} bits.`
          : null}
      </p>
      <p>
        Chance the daily buff actually fires after reset:{" "}
        <strong>{(pool.rollChanceNextReset * 100).toFixed(0)}%</strong> (at current tier).
      </p>
      {pool.activeBuff ? (
        <p>
          Active buff: <em>{pool.activeBuff}</em> (tier {pool.buffTier})
        </p>
      ) : (
        <p>No buff live right now.</p>
      )}
      <label>
        Contribute bits
        <input
          type="number"
          min={1}
          value={contribute}
          onChange={(e) => setContribute(Number(e.target.value))}
        />
      </label>
      <button type="button" onClick={() => void send()}>
        Add to pool (you have {props.bits.toLocaleString()} bits)
      </button>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
