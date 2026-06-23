import { BitsDisplay } from "../components/economy/BitsDisplay.js";
import { ShopPanel } from "../components/economy/ShopPanel.js";
import { ServerPool } from "../components/economy/ServerPool.js";
import type { Me } from "../types/index.js";

export function EconomyPage(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  onRefreshMe: () => void;
}) {
  return (
    <div>
      <h2 className="page-title">
        <span className="gradient-text">Economy</span>
      </h2>
      <BitsDisplay bits={props.me.bits} />
      <ShopPanel fetchApi={props.fetchApi} onBought={props.onRefreshMe} />
      <ServerPool bits={props.me.bits} fetchApi={props.fetchApi} onChange={props.onRefreshMe} />
    </div>
  );
}
