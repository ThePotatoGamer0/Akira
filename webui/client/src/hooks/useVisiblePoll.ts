import { useEffect } from "react";

/** Run `tick` while this tab is in front. Also runs once when you come back. */
export function useVisiblePoll(tick: () => void, ms: number, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") tick();
    };
    run();
    const id = window.setInterval(run, ms);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [tick, ms, enabled]);
}
