import { statCards } from "../components/stats/registry.js";
import type { Me } from "../types/index.js";

export function StatsPage(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  return (
    <div className="stats-page">
      <h2 className="page-title">
        <span className="gradient-text">Stats</span>
      </h2>
      <div className="stats-grid">
        {statCards.map((card) => (
          <section key={card.id} className="stats-card" data-stat={card.id} data-place={card.place}>
            <card.Component me={props.me} fetchApi={props.fetchApi} />
          </section>
        ))}
      </div>
    </div>
  );
}
