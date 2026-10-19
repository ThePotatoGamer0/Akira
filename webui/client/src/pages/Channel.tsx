import { useCallback, useEffect, useState } from "react";
import { renderChatLog, type ChatLog } from "../../../../modules/discord-log-html/src/index.js";
import "../../../../modules/discord-log-html/styles.css";

export function ChannelPage(props: { fetchApi: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await props.fetchApi("/channel");
    const json = (await res.json()) as { log?: ChatLog; error?: string };
    setLoading(false);
    if (!res.ok || !json.log) {
      setHtml(null);
      setError(json.error ?? "Akira couldn't read the drop channel.");
      return;
    }
    setHtml(renderChatLog(json.log));
  }, [props.fetchApi]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="channel-page">
      <div className="webui-hero">
        <div className="webui-hero-kana">Drop channel</div>
        <h1>
          <span className="gradient-text">Channel</span> <span className="beta-tag">BETA</span>
        </h1>
      </div>
      <p className="settings-hint">
        A read-only look at the drop channel. Grabs and messages happen in Discord.
      </p>
      <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
        {loading ? "Reading…" : "Refresh"}
      </button>
      {error ? (
        <p className="webui-alert" role="alert">
          {error}
        </p>
      ) : null}
      {html ? <div className="channel-log" dangerouslySetInnerHTML={{ __html: html }} /> : null}
    </div>
  );
}
