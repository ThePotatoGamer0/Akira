import type { ReactNode } from "react";

export function StatShell(props: { title: string; note?: string; controls?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="stats-card__head">
        <div>
          <h3>{props.title}</h3>
          {props.note ? <p className="stats-card__note">{props.note}</p> : null}
        </div>
        {props.controls ? <div className="stats-controls">{props.controls}</div> : null}
      </header>
      {props.children}
    </>
  );
}
