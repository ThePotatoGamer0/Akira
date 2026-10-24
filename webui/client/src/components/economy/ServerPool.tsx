import { useEffect, useState } from "react";

type PoolState = {
  totalBits: number;
  tier: number;
  choices: string[];
  live: string[];
  buffExpiry: string | null;
};

export function ServerPool(props: {
  bits: number;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  liveRev?: number;
  onChange?: () => void;
  onSettled?: (state: "ok" | "down") => void;
}) {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [contribute, setContribute] = useState("50");
  const [msg, setMsg] = useState<string | null>(null);
  const [down, setDown] = useState(false);

  async function load() {
    const res = await props.fetchApi("/economy/pool");
    if (res.ok) {
      setPool((await res.json()) as PoolState);
      setDown(false);
      props.onSettled?.("ok");
      return;
    }
    setDown(true);
    props.onSettled?.("down");
  }

  useEffect(() => {
    void load();
  }, [props.fetchApi, props.liveRev]);

  async function send() {
    setMsg(null);
    const bits = Number(contribute);
    if (!Number.isInteger(bits) || bits < 1) {
      setMsg("Enter a whole number of bits.");
      return;
    }
    const res = await props.fetchApi("/economy/pool/contribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bits }),
    });
    const j = (await res.json()) as { error?: string; poolTotal?: number };
    if (!res.ok) {
      setMsg(j.error ?? "Could not contribute");
      return;
    }
    setMsg(`The pot is now ${j.poolTotal?.toLocaleString() ?? "?"} bits, and your milestone bar moved with it.`);
    await load();
    props.onChange?.();
  }

  if (down || !pool) return null;

  return (
    <div className="panel">
      <h3>Server pool</h3>
      <p>
        The pot has <strong>{pool.totalBits.toLocaleString()}</strong> bits. Tier {pool.tier}.
      </p>
      <p>Can be chosen tonight: {pool.choices.length > 0 ? pool.choices.join(", ") : "nothing until 500 bits"}.</p>
      <p>
        Live: {pool.live.length > 0 ? `${pool.live.join(", ")} until ${pool.buffExpiry?.replace("T", " ").slice(0, 16)} UTC` : "none"}.
      </p>
      <label>
        Give bits
        <input
          type="number"
          min={1}
          value={contribute}
          onChange={(e) => setContribute(e.target.value)}
        />
      </label>
      <button type="button" onClick={() => void send()}>
        Add to pool (you have {props.bits.toLocaleString()} bits)
      </button>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
