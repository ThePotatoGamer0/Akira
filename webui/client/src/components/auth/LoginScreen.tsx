import { useState } from "react";

export function LoginScreen(props: {
  onLoggedIn: () => void;
  onNeedVerify: () => void;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await props.fetchApi("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(j.error ?? "Login failed");
      return;
    }
    props.onLoggedIn();
  }

  return (
    <div className="panel">
      <h2>
        <span className="gradient-text">Welcome</span> back
      </h2>
      <p>Akira will need your Discord username and the site password you set earlier.</p>
      <form onSubmit={(e) => void login(e)}>
        <label>
          Discord username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Site password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button type="submit">Sign in</button>
        <button type="button" className="secondary" onClick={() => props.onNeedVerify()}>
          First time? Verify with Discord
        </button>
        {msg ? <p role="alert">{msg}</p> : null}
      </form>
    </div>
  );
}
