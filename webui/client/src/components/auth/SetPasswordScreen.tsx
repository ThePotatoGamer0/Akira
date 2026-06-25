import { useState } from "react";

export function SetPasswordScreen(props: {
  onDone: () => void;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await props.fetchApi("/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(j.error ?? "Could not save password");
      return;
    }
    props.onDone();
  }

  return (
    <div className="panel">
      <h2>
        Set your <span className="gradient-text">site password</span>
      </h2>
      <p>Akira will use this for the browser WebUI only - keep it different from your Discord password.</p>
      <form onSubmit={(e) => void save(e)}>
        <label>
          Password (8+ characters)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button type="submit">Save</button>
        {msg ? <p role="alert">{msg}</p> : null}
      </form>
    </div>
  );
}
