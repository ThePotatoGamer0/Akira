import { useEffect, useState } from "react";
import { MenuSelect } from "../components/MenuSelect.js";
import { PREFERRED_NAME_MAX, sanitizePreferredName } from "../lib/akiraAddressName.js";
import { hapticsEnabled, hapticsSupported, setHapticsEnabled } from "../lib/haptics.js";
import { writeCollectionPrefs } from "../lib/collectionPrefs.js";
import { COLLECTION_ORDERS, collectionOrder } from "../lib/collectionView.js";
import { frameLabel, studioFrames } from "../lib/frames.js";
import type { CollectionStudio, Me } from "../types/index.js";

const EMPTY_STUDIO: CollectionStudio = { serverFrame: 0, personalFrame: null, frames: [{ id: 0, name: "Dark" }], tags: [] };

export function SettingsPage(props: {
  me: Me;
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
  readOnly?: boolean;
  onSaved: () => void;
}) {
  const [preferredName, setPreferredName] = useState(sanitizePreferredName(props.me.preferredName ?? "") ?? "");
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [studio, setStudio] = useState<CollectionStudio>(EMPTY_STUDIO);
  const [order, setOrder] = useState(collectionOrder(props.me.collectionOrder));
  const [continuous, setContinuous] = useState(props.me.continuousScroll === true);
  const [collectionMsg, setCollectionMsg] = useState<string | null>(null);
  const [collectionBusy, setCollectionBusy] = useState<string | null>(null);
  const [reminders, setReminders] = useState<{ action: string; enabled: boolean }[] | null>(null);
  const [remindersDown, setRemindersDown] = useState(false);
  const [reminderBusy, setReminderBusy] = useState<string | null>(null);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const [haptics, setHaptics] = useState(hapticsEnabled);
  const [canBuzz, setCanBuzz] = useState(hapticsSupported);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const sync = () => setCanBuzz(hapticsSupported());
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setPreferredName(sanitizePreferredName(props.me.preferredName ?? "") ?? "");
  }, [props.me.preferredName, props.me.id]);

  useEffect(() => {
    setOrder(collectionOrder(props.me.collectionOrder));
    setContinuous(props.me.continuousScroll === true);
  }, [props.me.collectionOrder, props.me.continuousScroll, props.me.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await props.fetchApi(`/collection/${props.me.id}/studio`);
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as CollectionStudio;
      if (!cancelled) setStudio({ ...json, frames: studioFrames(json.frames) });
    })();
    return () => {
      cancelled = true;
    };
  }, [props.fetchApi, props.me.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await props.fetchApi("/reminders");
      if (cancelled) return;
      if (!res.ok) {
        setRemindersDown(true);
        return;
      }
      const json = (await res.json()) as { reminders?: { action: string; enabled: boolean }[] };
      setRemindersDown(false);
      setReminders(json.reminders ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.fetchApi]);

  async function setReminder(action: string, enabled: boolean) {
    setReminderMsg(null);
    setReminderBusy(action);
    const res = await props.fetchApi("/reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, enabled }),
    });
    setReminderBusy(null);
    if (!res.ok) {
      setReminderMsg("Akira couldn't save that reminder.");
      return false;
    }
    const json = (await res.json()) as { reminders?: { action: string; enabled: boolean }[] };
    setReminders(json.reminders ?? []);
    return true;
  }

  async function patchName(value: string) {
    if (props.readOnly) {
      setNameMsg("She'll remember that name when she's back.");
      return;
    }
    setNameMsg(null);
    setSavingName(true);
    const res = await props.fetchApi("/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredName: value.trim() }),
    });
    const j = (await res.json()) as Me | { error?: string };
    setSavingName(false);
    if (!res.ok) {
      setNameMsg("error" in j ? (j.error ?? "Could not save") : "Could not save");
      return;
    }
    const next = j as Me;
    setPreferredName(next.preferredName ?? "");
    props.onSaved();
    setNameMsg(value.trim() && !next.preferredName ? "Akira is using your Discord name." : "Saved.");
  }

  async function patchCollection(body: { collectionOrder?: string; continuousScroll?: boolean }) {
    const key = "collectionOrder" in body ? "order" : "scroll";
    const previous = { collectionOrder: order, continuousScroll: continuous };
    writeCollectionPrefs(props.me.id, body);
    setCollectionMsg(null);
    if (props.readOnly) return true;
    setCollectionBusy(key);
    const res = await props.fetchApi("/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as Me | { error?: string };
    setCollectionBusy(null);
    if (res.ok) {
      props.onSaved();
      setCollectionMsg("Saved.");
      return true;
    }
    if (res.status >= 500) return true;
    writeCollectionPrefs(props.me.id, previous);
    setCollectionMsg("error" in j ? (j.error ?? "Could not save") : "Could not save");
    return false;
  }

  async function saveFrame(value: string) {
    if (props.readOnly) {
      setCollectionMsg("She'll keep that frame when she's back.");
      return;
    }
    const frameId = value === "" ? null : Number(value);
    if (frameId !== null && !Number.isInteger(frameId)) return;
    setCollectionMsg(null);
    setCollectionBusy("frame");
    try {
      const res = await props.fetchApi(`/collection/${props.me.id}/default-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameId }),
      });
      const json = (await res.json()) as { personalFrame?: number | null; error?: string };
      if (!res.ok) {
        setCollectionMsg(json.error ?? "Akira couldn't save your frame.");
        return;
      }
      setStudio((current) => ({ ...current, personalFrame: json.personalFrame ?? null }));
      setCollectionMsg(frameId === null ? "Your cards use the server frame again." : "Your frame is saved.");
    } catch {
      setCollectionMsg("Akira couldn't save your frame.");
    } finally {
      setCollectionBusy(null);
    }
  }

  return (
    <div>
      <h2 className="page-title">
        <span className="gradient-text">Settings</span>
      </h2>
      <p className="webui-lede">
        These stay put until you change them. Search, the order for this visit, tags, and select still live on the collection page.
      </p>

      <div className="panel">
        <h2>
          <span className="gradient-text">General</span>
        </h2>
        <p className="settings-hint">
          Choose how Akira addresses you in the WebUI home greeting and in <code>/ping</code> and <code>/help</code>. One word, up to {PREFERRED_NAME_MAX} letters. Only the first letter can be a capital. Leave it blank to use your Discord handle (<strong>{props.me.discordUsername ?? "-"}</strong>).
        </p>
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
              onChange={(e) => setPreferredName(sanitizePreferredName(e.target.value) ?? "")}
              placeholder={props.me.discordUsername ?? "e.g. Potato"}
              maxLength={64}
              autoComplete="nickname"
              spellCheck={false}
              disabled={props.readOnly}
            />
          </label>
          <button type="submit" disabled={savingName || props.readOnly}>
            {savingName ? "Saving…" : "Save"}
          </button>
          <button type="button" className="secondary" disabled={savingName || props.readOnly} onClick={() => void patchName("")}>
            Use Discord name only
          </button>
          {nameMsg ? <p role="status">{nameMsg}</p> : null}
        </form>
        <p className="settings-current">
          Currently: <strong>{props.me.displayName}</strong>
        </p>
        {canBuzz ? (
          <div className="settings-row settings-switch">
            <div>
              <span className="settings-label">Button buzz</span>
              <p className="settings-hint">A short buzz when you press a button or pick something from a menu.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={haptics}
              aria-label="Button buzz"
              onClick={() => {
                const next = !haptics;
                setHaptics(next);
                setHapticsEnabled(next);
              }}
            >
              <span />
            </button>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2>
          <span className="gradient-text">Collection</span>
        </h2>
        <div className="settings-row">
          <span className="settings-label">Your frame</span>
          <MenuSelect
            className="settings-menu"
            label="Your default frame"
            value={studio.personalFrame === null ? "" : String(studio.personalFrame)}
            disabled={collectionBusy !== null || props.readOnly}
            options={[
              { value: "", label: `Server frame · ${frameLabel(studio.frames, studio.serverFrame)}` },
              ...studio.frames.map((frame) => ({ value: String(frame.id), label: frame.name })),
            ]}
            onChange={(value) => void saveFrame(value)}
          />
          <p className="settings-hint">Cards without a frame of their own use this one.</p>
        </div>
        <div className="settings-row">
          <span className="settings-label">Default order</span>
          <MenuSelect
            className="settings-menu"
            label="Default collection order"
            value={order}
            disabled={collectionBusy !== null}
            options={COLLECTION_ORDERS.map((option) => ({ value: option.id, label: option.label }))}
            onChange={(value) => {
              const next = collectionOrder(value);
              const previous = order;
              setOrder(next);
              void patchCollection({ collectionOrder: next }).then((saved) => {
                if (!saved) setOrder(previous);
              });
            }}
          />
          <p className="settings-hint">The collection opens in this order. The menu on that page can change it while you look.</p>
        </div>
        <div className="settings-row settings-switch">
          <div>
            <span className="settings-label">Continuous scrolling</span>
            <p className="settings-hint">
              Turn this on to drop the page buttons. The grid still loads 16 cards at a time as you scroll.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={continuous}
            aria-label="Continuous scrolling"
            disabled={collectionBusy !== null}
            onClick={() => {
              const next = !continuous;
              setContinuous(next);
              void patchCollection({ continuousScroll: next }).then((saved) => {
                if (!saved) setContinuous(!next);
              });
            }}
          >
            <span />
          </button>
        </div>
        {collectionMsg ? <p role="status">{collectionMsg}</p> : null}
      </div>
      <div className="panel">
        <h2>Reminders</h2>
        <p className="settings-hint">
          These are the same switches as /reminders. When one is on, Akira DMs you and leaves a note in the bell.
        </p>
        {remindersDown ? (
          <p className="settings-hint">She'll take reminder notes when she's back.</p>
        ) : reminders === null ? (
          <p className="settings-hint">Loading…</p>
        ) : (
          reminders.map((row) => (
            <div className="settings-row settings-switch" key={row.action}>
              <div>
                <span className="settings-label">{row.action === "daily" ? "Daily" : row.action === "drop" ? "Drop" : "Grab"}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={row.enabled}
                aria-label={`${row.action} reminder`}
                disabled={reminderBusy !== null || props.readOnly}
                onClick={() => {
                  const next = !row.enabled;
                  setReminders((current) =>
                    current?.map((item) => (item.action === row.action ? { ...item, enabled: next } : item)) ?? current,
                  );
                  void setReminder(row.action, next).then((saved) => {
                    if (!saved) {
                      setReminders((current) =>
                        current?.map((item) => (item.action === row.action ? { ...item, enabled: !next } : item)) ?? current,
                      );
                    }
                  });
                }}
              >
                <span />
              </button>
            </div>
          ))
        )}
        {reminderMsg ? (
          <p role="alert">{reminderMsg}</p>
        ) : null}
      </div>
    </div>
  );
}
