import { useState } from "react";
import { BitsDisplay } from "../components/economy/BitsDisplay.js";
import { CyclePanel } from "../components/economy/MilestonePanel.js";
import { ShopPanel } from "../components/economy/ShopPanel.js";
import { ServerPool } from "../components/economy/ServerPool.js";
import { NappingNotice } from "../components/NappingNotice.js";
import type { Me } from "../types/index.js";

export function EconomyPage(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  liveRev?: number;
  onRefreshMe: () => void;
}) {
  const [shop, setShop] = useState<"wait" | "ok" | "down">("wait");
  const [pool, setPool] = useState<"wait" | "ok" | "down">("wait");
  const [cycle, setCycle] = useState<"wait" | "ok" | "down">("wait");
  const settled = shop !== "wait" && pool !== "wait" && cycle !== "wait";
  const empty = shop === "down" && pool === "down" && cycle === "down";

  return (
    <div>
      <h2 className="page-title">
        <span className="gradient-text">Economy</span>
      </h2>
      <BitsDisplay bits={props.me.bits} />
      {settled && empty ? (
        <NappingNotice body="The shop and the pot can wait. Peek back in a moment?" />
      ) : null}
      <ShopPanel fetchApi={props.fetchApi} liveRev={props.liveRev} onBought={props.onRefreshMe} onSettled={setShop} />
      <ServerPool
        bits={props.me.bits}
        fetchApi={props.fetchApi}
        liveRev={props.liveRev}
        onChange={props.onRefreshMe}
        onSettled={setPool}
      />
      <CyclePanel
        bits={props.me.bits}
        fetchApi={props.fetchApi}
        liveRev={props.liveRev}
        onChange={props.onRefreshMe}
        onSettled={setCycle}
      />
    </div>
  );
}
