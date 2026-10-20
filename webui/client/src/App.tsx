import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/useAuth.js";
import { LoginScreen } from "./components/auth/LoginScreen.js";
import { VerifyScreen } from "./components/auth/VerifyScreen.js";
import { SetPasswordScreen } from "./components/auth/SetPasswordScreen.js";
import { WebUiShell } from "./components/WebUiShell.js";
import { Home } from "./pages/Home.js";
import { CollectionPage } from "./pages/Collection.js";
import { EconomyPage } from "./pages/Economy.js";
import { StatsPage } from "./pages/Stats.js";
import { AdminPage } from "./pages/Admin.js";
import { NoticeBell } from "./components/NoticeBell.js";
import { SettingsPage } from "./pages/Settings.js";
import { ChannelPage } from "./pages/Channel.js";
import "./styles.css";

type AuthView = "login" | "verify" | "setpass";

function CompactActivity(props: { name?: string; loading: boolean; error: string | null }) {
  let line = "Signed in";
  if (props.error) line = props.error;
  else if (props.loading) line = "Signing in…";
  else if (props.name) line = `Signed in as ${props.name}`;
  return (
    <div className="webui-pip">
      <div className="webui-pip-brand">Akira</div>
      <p className="webui-pip-line">{line}</p>
    </div>
  );
}

export function App() {
  const auth = useAuth();
  const location = useLocation();
  const [authView, setAuthView] = useState<AuthView>("login");
  const compact = auth.activityLayout === "pip" || auth.activityLayout === "grid";

  useEffect(() => {
    document.documentElement.classList.toggle("webui-activity", auth.isDiscordActivity);
    return () => document.documentElement.classList.remove("webui-activity");
  }, [auth.isDiscordActivity]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    document.querySelector(".webui-nav a.active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [location.pathname]);

  if (compact) {
    return (
      <WebUiShell compact>
        <CompactActivity name={auth.me?.displayName} loading={auth.loading} error={auth.error} />
      </WebUiShell>
    );
  }

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
    const fetchBrowser = auth.fetchApi;

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
      <NoticeBell fetchApi={auth.fetchApi} />
      <header className="webui-header">
        <div>
          <div className="webui-kana">ア キ ラ - WebUI</div>
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
        <NavLink to="/stats" className={({ isActive }) => (isActive ? "active" : "")}>
          Stats
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Settings
        </NavLink>
        {auth.isDiscordActivity ? null : (
          <NavLink to="/channel" className={({ isActive }) => (isActive ? "active" : "")}>
            Channel <span className="beta-tag">BETA</span>
          </NavLink>
        )}
        {me.isAdmin ? (
          <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>
            Admin
          </NavLink>
        ) : null}
      </nav>
      <div className="webui-main">
        <Routes>
          <Route path="/" element={<Home me={me} showChannel={!auth.isDiscordActivity} />} />
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
          <Route path="/stats" element={<StatsPage me={me} fetchApi={auth.fetchApi} />} />
          <Route path="/leaderboard" element={<Navigate to="/stats" replace />} />
          <Route path="/personalise" element={<Navigate to="/settings" replace />} />
          <Route
            path="/settings"
            element={
              <SettingsPage me={me} fetchApi={auth.fetchApi} onSaved={() => void auth.refreshMe()} />
            }
          />
          <Route
            path="/channel"
            element={
              auth.isDiscordActivity ? <Navigate to="/" replace /> : <ChannelPage fetchApi={auth.fetchApi} />
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
