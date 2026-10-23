import { useEffect, useState } from "react";

type MilestoneRow = {
  step: number;
  cost: number;
  payout: number;
  prestige: string | null;
  claimed: boolean;
};

type Status = {
  claimed: number;
  progress: number;
  bitsLeft: number | null;
  canClaim: boolean;
  milestones: MilestoneRow[];
  prestigePreview: { waiting: string; keep: string[]; canPrestige: boolean };
  shop: { name: string; expiresAt: string; seriesName: string | null }[];
  server: { names: string[]; expiresAt: string } | null;
  prestige: { line: string; stacks: number }[];
  combined: string[];
};

function MilestoneMeter(props: { progress: number; milestones: MilestoneRow[] }) {
  const next = props.milestones.find((row) => !row.claimed);
  const ratio = !next || next.cost <= 0 ? 1 : Math.min(1, props.progress / next.cost);
  const label = next ? `${props.progress.toLocaleString()} / ${next.cost.toLocaleString()}` : "The bar is full.";
  return (
    <>
      <div
        className="milestone-meter"
        role="meter"
        aria-label="Milestone progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="milestone-note">{label}</p>
    </>
  );
}

export function CyclePanel(props: {
  bits: number;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  onChange?: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    const res = await props.fetchApi("/economy/status");
    if (res.ok) setStatus((await res.json()) as Status);
  }

  useEffect(() => {
    void load();
  }, [props.fetchApi, props.bits]);

  async function claim() {
    setMsg(null);
    const res = await props.fetchApi("/economy/milestone/claim", { method: "POST" });
    const body = (await res.json()) as { error?: string; payout?: number };
    if (!res.ok) {
      setMsg(body.error ?? "Could not claim");
      return;
    }
    setMsg(`Claimed. ${body.payout?.toLocaleString() ?? ""} bits paid.`);
    await load();
    props.onChange?.();
  }

  async function prestige() {
    setMsg(null);
    const res = await props.fetchApi("/economy/prestige", { method: "POST" });
    const body = (await res.json()) as { error?: string; prestigeLevel?: number };
    if (!res.ok) {
      setMsg(body.error ?? "Could not prestige");
      return;
    }
    setConfirming(false);
    setMsg(`Prestige ${body.prestigeLevel}. The bar is back at the start.`);
    await load();
    props.onChange?.();
  }

  if (!status) return null;

  const groups = [status.shop.length > 0, status.server !== null, status.prestige.length > 0].filter(Boolean).length;
  const effectHome = groups > 1 ? "together" : status.shop.length > 0 ? "shop" : status.server ? "server" : null;
  const anyBuff = groups > 0;

  return (
    <>
      <div className="panel">
        <h3>Milestones</h3>
        <p>
          Step {status.claimed}. Bar {status.progress.toLocaleString()} bits.
          {status.bitsLeft === null
            ? " This is the last milestone."
            : ` ${status.bitsLeft.toLocaleString()} bits left until the next one.`}
        </p>
        <MilestoneMeter progress={status.progress} milestones={status.milestones} />
        <ol className="milestone-list">
          {status.milestones.map((row) => (
            <li key={row.step} className={row.claimed ? "is-claimed" : undefined}>
              <span className="milestone-step">Step {row.step}</span>
              <span>
                {row.claimed
                  ? "Claimed"
                  : `${row.cost.toLocaleString()} bits given, pays ${row.payout.toLocaleString()}`}
              </span>
              {row.prestige ? <span className="milestone-note">{row.prestige}</span> : null}
            </li>
          ))}
        </ol>
        {status.canClaim ? (
          <button type="button" onClick={() => void claim()}>
            Claim
          </button>
        ) : null}
      </div>
      <div className="panel">
        <h3>Prestige</h3>
        <p>{status.prestigePreview.waiting}</p>
        <p>
          {status.prestigePreview.keep.length > 0
            ? `Prestiging now keeps: ${status.prestigePreview.keep.join(" ")}`
            : "Prestiging now keeps no permanent buffs."}
        </p>
        {status.prestigePreview.canPrestige && !confirming ? (
          <button type="button" onClick={() => setConfirming(true)}>
            Prestige
          </button>
        ) : null}
        {confirming ? (
          <p>
            This resets the bar to the 250-bit milestone and stamps the permanents above.
            <button type="button" onClick={() => void prestige()}>
              Confirm prestige
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Keep the bar
            </button>
          </p>
        ) : null}
      </div>
      <div className="panel">
        <h3>Buffs</h3>
        {status.shop.length > 0 ? (
          <>
            <h4>Shop</h4>
            <ul>
              {status.shop.map((row) => (
                <li key={row.name}>
                  {row.name}
                  {row.seriesName ? ` (${row.seriesName})` : ""} until {row.expiresAt.replace("T", " ").slice(0, 16)} UTC
                </li>
              ))}
            </ul>
            {effectHome === "shop" ? (
              <ul>
                {status.combined.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {status.server ? (
          <>
            <h4>Server</h4>
            <p>
              {status.server.names.join(", ")} until {status.server.expiresAt.replace("T", " ").slice(0, 16)} UTC
            </p>
            {effectHome === "server" ? (
              <ul>
                {status.combined.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {status.prestige.length > 0 ? (
          <>
            <h4>Prestige</h4>
            <ul>
              {status.prestige.map((row) => (
                <li key={row.line}>{row.line}</li>
              ))}
            </ul>
          </>
        ) : null}
        {effectHome === "together" && status.combined.length > 0 ? (
          <>
            <h4>Together</h4>
            <ul>
              {status.combined.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        {anyBuff ? null : <p>No buffs are on you right now.</p>}
      </div>
      {msg ? <p>{msg}</p> : null}
    </>
  );
}
