import { useEffect, useState } from "react";
import type { Me } from "../types/index.js";

export function PersonalisePage(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  onSaved: () => void;
}) {
  const [preferredName, setPreferredName] = useState(props.me.preferredName ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPreferredName(props.me.preferredName ?? "");
  }, [props.me.preferredName, props.me.id]);

  async function patchName(value: string) {
    setMsg(null);
    setSaving(true);
    const res = await props.fetchApi("/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredName: value.trim() }),
    });
    const j = (await res.json()) as Me | { error?: string };
    setSaving(false);
    if (!res.ok) {
      setMsg("error" in j ? (j.error ?? "Could not save") : "Could not save");
      return false;
    }
    const next = j as Me;
    setPreferredName(next.preferredName ?? "");
    props.onSaved();
    setMsg("Saved.");
    return true;
  }

  return (
    <div>
      <h2 className="page-title">
        <span className="gradient-text">Personalise</span>
      </h2>
      <p className="webui-lede">
        Choose how Akira addresses you in the WebUI home greeting and in <code>/ping</code> and{" "}
        <code>/help</code>. Leave blank to use your Discord handle (
        <strong>{props.me.discordUsername ?? "-"}</strong>).
      </p>

      <div className="panel">
        <h2>
          <span className="gradient-text">Name</span>
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void patchName(preferredName);
          }}
        >
          <label>
            What should Akira call you?
            <input
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder={props.me.discordUsername ?? "e.g. Potato"}
              maxLength={64}
              autoComplete="nickname"
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={() => void patchName("")}
          >
            Use Discord name only
          </button>
          {msg ? <p role="status">{msg}</p> : null}
        </form>
        <p style={{ marginTop: "1rem", fontSize: "0.88rem", color: "var(--muted)" }}>
          Currently: <strong>{props.me.displayName}</strong>
        </p>
      </div>
    </div>
  );
}
