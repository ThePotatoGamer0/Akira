import { useId } from "react";

export function AkiraMark() {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="api-down__mark" viewBox="0 0 88 88" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="12%" y1="8%" x2="92%" y2="96%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="50%" stopColor="var(--accent2)" />
          <stop offset="100%" stopColor="var(--accent3)" />
        </linearGradient>
      </defs>
      <circle cx="44" cy="44" r="42" fill="none" stroke={`url(#${id})`} strokeWidth="2.2" />
      <text
        x="44"
        y="50"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Zen Kaku Gothic New', sans-serif"
        fontWeight="900"
        fontSize="22"
        letterSpacing="0.04em"
        fill={`url(#${id})`}
      >
        アキラ
      </text>
    </svg>
  );
}

export function NappingNotice(props: {
  body: string;
  heading?: string;
  onPoke?: () => void | Promise<unknown>;
}) {
  return (
    <div className="panel api-down">
      <AkiraMark />
      <h2>
        <span className="gradient-text">{props.heading ?? "Akira is napping"}</span>
      </h2>
      <p role="alert">{props.body}</p>
      {props.onPoke ? (
        <button type="button" onClick={() => void props.onPoke?.()}>
          Poke her
        </button>
      ) : null}
    </div>
  );
}
