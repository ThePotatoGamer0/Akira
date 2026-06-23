import { useState } from "react";

export function VerifyScreen(props: {
  onVerified: (needsPassword: boolean) => void;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [username, setUsername] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await props.fetchApi("/auth/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const j = (await res.json()) as { error?: string; message?: string };
    if (!res.ok) {
      setMsg(j.error ?? "Could not start verification");
      return;
    }
    setSent(true);
    setMsg(j.message ?? "Check your DMs!");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await props.fetchApi("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = (await res.json()) as { error?: string; needsPassword?: boolean };
    if (!res.ok) {
      setMsg(j.error ?? "Verification failed");
      return;
    }
    props.onVerified(Boolean(j.needsPassword));
  }

  return (
    <div className="panel">
      <h2>
        Sign in with <span className="gradient-text">Discord</span>
      </h2>
      <p>Akira will DM you a short code. Make sure DMs from server members are open.</p>
      {!sent ? (
        <form onSubmit={(e) => void sendCode(e)}>
          <label>
            Discord username
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <button type="submit">Send code</button>
          {msg ? <p>{msg}</p> : null}
        </form>
      ) : (
        <form onSubmit={(e) => void verify(e)}>
          <label>
            Code from Akira
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          </label>
          <button type="submit">Verify</button>
          {msg ? <p>{msg}</p> : null}
        </form>
      )}
    </div>
  );
}
