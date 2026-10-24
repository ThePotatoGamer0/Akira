import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

function MilestoneSteps(props: { milestones: MilestoneRow[]; currentStep: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLLIElement>(null);

  useLayoutEffect(() => {
    const box = scroller.current;
    const row = current.current;
    if (!box || !row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = top;
  }, [props.currentStep, props.milestones]);

  return (
    <div className="milestone-scroll" ref={scroller}>
      <ol className="milestone-list">
        {props.milestones.map((row) => (
          <li
            key={row.step}
            ref={row.step === props.currentStep ? current : undefined}
            className={row.claimed ? "is-claimed" : undefined}
          >
            <span className="milestone-step">Stage {row.step}</span>
            <span>
              {row.claimed
                ? "Claimed"
                : `${row.cost.toLocaleString()} bits given, pays ${row.payout.toLocaleString()}`}
            </span>
            {row.prestige ? <span className="milestone-note">{row.prestige}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function clockLeft(expiresAt: string, now: number): string {
  const total = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  return now;
}

function BuffEffects(props: { lines: string[] }) {
  if (props.lines.length === 0) return null;
  return (
    <div className="buff-effects">
      {props.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function BuffBoard(props: { status: Status; effectHome: "shop" | "server" | "together" | null }) {
  const timed = props.status.shop.length > 0 || props.status.server !== null;
  const now = useNow(timed);
  const { status, effectHome } = props;
  return (
    <div className="buff-groups">
      {status.shop.length > 0 ? (
        <section className="buff-group">
          <h4>Shop</h4>
          <ul>
            {status.shop.map((row) => (
              <li className="buff-row" key={`${row.name}-${row.seriesName ?? ""}`}>
                <span>
                  <strong>{row.name}</strong>
                  {row.seriesName ? <span className="buff-row__detail">{row.seriesName}</span> : null}
                </span>
                <span className="buff-clock">{clockLeft(row.expiresAt, now)}</span>
              </li>
            ))}
          </ul>
          {effectHome === "shop" ? <BuffEffects lines={status.combined} /> : null}
        </section>
      ) : null}
      {status.server ? (
        <section className="buff-group">
          <h4>Server</h4>
          <ul>
            {status.server.names.map((name) => (
              <li className="buff-row" key={name}>
                <strong>{name}</strong>
                <span className="buff-clock">{clockLeft(status.server!.expiresAt, now)}</span>
              </li>
            ))}
          </ul>
          {effectHome === "server" ? <BuffEffects lines={status.combined} /> : null}
        </section>
      ) : null}
      {status.prestige.length > 0 ? (
        <section className="buff-group">
          <h4>Prestige</h4>
          <ul>
            {status.prestige.map((row) => (
              <li className="buff-row" key={row.line}>
                <span>{row.line}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {effectHome === "together" ? (
        <section className="buff-group">
          <h4>Together</h4>
          <BuffEffects lines={status.combined} />
        </section>
      ) : null}
    </div>
  );
}

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
  liveRev?: number;
  onChange?: () => void;
  onSettled?: (state: "ok" | "down") => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    const res = await props.fetchApi("/economy/status");
    if (res.ok) {
      setStatus((await res.json()) as Status);
      props.onSettled?.("ok");
      return;
    }
    props.onSettled?.("down");
  }

  useEffect(() => {
    void load();
  }, [props.fetchApi, props.bits, props.liveRev]);

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

  const upcoming = status.milestones.find((row) => !row.claimed);
  const step = upcoming ? upcoming.step : status.claimed;
  const groups = [status.shop.length > 0, status.server !== null, status.prestige.length > 0].filter(Boolean).length;
  const effectHome = groups > 1 ? "together" : status.shop.length > 0 ? "shop" : status.server ? "server" : null;
  const anyBuff = groups > 0;

  return (
    <>
      <div className="panel">
        <h3>Milestones</h3>
        <p>
          You are on stage {step}.
          {status.bitsLeft === null
            ? " This is the last stage."
            : ` ${status.bitsLeft.toLocaleString()} bits left until you reach the next stage.`}
        </p>
        <MilestoneMeter progress={status.progress} milestones={status.milestones} />
        <MilestoneSteps milestones={status.milestones} currentStep={step} />
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
        {anyBuff ? <BuffBoard status={status} effectHome={effectHome} /> : <p>No buffs are on you right now.</p>}
      </div>
      {msg ? <p>{msg}</p> : null}
    </>
  );
}
