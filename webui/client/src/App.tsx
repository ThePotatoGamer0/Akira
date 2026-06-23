import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth.js";
import { LoginScreen } from "./components/auth/LoginScreen.js";
import { VerifyScreen } from "./components/auth/VerifyScreen.js";
import { SetPasswordScreen } from "./components/auth/SetPasswordScreen.js";
import { WebUiShell } from "./components/WebUiShell.js";
import { Home } from "./pages/Home.js";
import { CollectionPage } from "./pages/Collection.js";
import { EconomyPage } from "./pages/Economy.js";
import { LeaderboardPage } from "./pages/Leaderboard.js";
import { AdminPage } from "./pages/Admin.js";
import { PersonalisePage } from "./pages/Personalise.js";
import "./styles.css";

type AuthView = "login" | "verify" | "setpass";

export function App() {
  const auth = useAuth();
  const [authView, setAuthView] = useState<AuthView>("login");

  if (auth.loading) {
    return (
      <WebUiShell>
        <p className="webui-muted webui-fade">Akira is loading…</p>
      </WebUiShell>
    );
  }

  if (auth.isDiscordActivity && auth.error) {
    return (
      <WebUiShell>
        <p className="webui-alert" role="alert">
          Could not connect to Discord: {auth.error}
        </p>
      </WebUiShell>
    );
  }

  if (!auth.isDiscordActivity && !auth.me) {
    const fetchBrowser = (path: string, init?: RequestInit) =>
      fetch(path, { ...init, credentials: "include" });

    if (authView === "verify") {
      return (
        <WebUiShell>
          <div className="webui-auth-stack">
            <VerifyScreen
              fetchApi={fetchBrowser}
              onVerified={(needs) => {
                if (needs) setAuthView("setpass");
                else void auth.refreshMe();
              }}
            />
            <button type="button" className="secondary" onClick={() => setAuthView("login")}>
              Back to login
            </button>
          </div>
        </WebUiShell>
      );
    }
    if (authView === "setpass") {
      return (
        <WebUiShell>
          <SetPasswordScreen fetchApi={fetchBrowser} onDone={() => void auth.refreshMe()} />
        </WebUiShell>
      );
    }
    return (
      <WebUiShell>
        <LoginScreen
          fetchApi={fetchBrowser}
          onLoggedIn={() => void auth.refreshMe()}
          onNeedVerify={() => setAuthView("verify")}
        />
      </WebUiShell>
    );
  }

  if (!auth.me) {
    return (
      <WebUiShell>
        <p className="webui-alert">Akira couldn&apos;t load your profile.</p>
      </WebUiShell>
    );
  }

  const me = auth.me;

  return (
    <WebUiShell>
      <header className="webui-header">
        <div>
          <div className="webui-kana">ア キ ラ — WebUI</div>
          <div className="webui-brand">
            <span className="gradient-text">Akira</span>
          </div>
        </div>
        <div className="webui-badge">
          Signed in · {me.displayName}
          {me.isAdmin ? (
            <>
              {" "}
              · <strong>Admin</strong>
            </>
          ) : null}
        </div>
      </header>
      <nav className="webui-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Home
        </NavLink>
        <NavLink to="/collection" className={({ isActive }) => (isActive ? "active" : "")}>
          Collection
        </NavLink>
        <NavLink to="/economy" className={({ isActive }) => (isActive ? "active" : "")}>
          Economy
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? "active" : "")}>
          Leaderboard
        </NavLink>
        <NavLink to="/personalise" className={({ isActive }) => (isActive ? "active" : "")}>
          Personalise
        </NavLink>
        {me.isAdmin ? (
          <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>
            Admin
          </NavLink>
        ) : null}
      </nav>
      <div className="webui-main">
        <Routes>
          <Route path="/" element={<Home me={me} />} />
          <Route path="/collection" element={<CollectionPage me={me} fetchApi={auth.fetchApi} />} />
          <Route
            path="/economy"
            element={
              <EconomyPage
                me={me}
                fetchApi={auth.fetchApi}
                onRefreshMe={() => void auth.refreshMe()}
              />
            }
          />
          <Route path="/leaderboard" element={<LeaderboardPage fetchApi={auth.fetchApi} />} />
          <Route
            path="/personalise"
            element={
              <PersonalisePage me={me} fetchApi={auth.fetchApi} onSaved={() => void auth.refreshMe()} />
            }
          />
          <Route
            path="/admin"
            element={
              me.isAdmin ? (
                <AdminPage fetchApi={auth.fetchApi} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </WebUiShell>
  );
}
