import { useMemo } from "react";
import { Link } from "react-router-dom";
import { akiraAddressName } from "../lib/akiraAddressName.js";
import { homeWelcomeParts } from "../lib/homeWelcome.js";
import type { Me } from "../types/index.js";

export function Home(props: { me: Me | null }) {
  const address = props.me ? akiraAddressName(props.me) : undefined;
  const welcome = useMemo(
    () => homeWelcomeParts(new Date(), address),
    [address],
  );

  return (
    <div>
      <div className="webui-hero">
        <div className="webui-hero-kana">Dashboard</div>
        <h1>
          <span className="gradient-text">{welcome.lead}</span>
          {welcome.tail}
        </h1>
      </div>

      <div className="webui-section-label">Where to next</div>
      <ul className="webui-link-grid">
        <li>
          <Link to="/collection" className="webui-link-card">
            Collection
          </Link>
        </li>
        <li>
          <Link to="/economy" className="webui-link-card">
            Economy &amp; pool
          </Link>
        </li>
        <li>
          <Link to="/leaderboard" className="webui-link-card">
            Leaderboard
          </Link>
        </li>
        <li>
          <Link to="/personalise" className="webui-link-card">
            Personalise
          </Link>
        </li>
        {props.me?.isAdmin ? (
          <li>
            <Link to="/admin" className="webui-link-card">
              Admin
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
