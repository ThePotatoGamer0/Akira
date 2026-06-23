import { useState } from "react";

export function InitTrigger(props: {
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setMsg(null);
    const res = await props.fetchApi("/admin/init", { method: "POST" });
    const j = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMsg(j.error ?? "Failed to queue regeneration");
      return;
    }
    setMsg(j.message ?? "Queued.");
  }

  return (
    <div className="panel">
      <h3>Asset generation</h3>
      <p>This kicks off `npm run generate` on the server — it can take a long time.</p>
      <button type="button" onClick={() => void run()}>
        Regenerate card assets
      </button>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
