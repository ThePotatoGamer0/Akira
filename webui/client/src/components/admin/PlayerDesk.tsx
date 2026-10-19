import { useEffect, useState } from "react";
import { ConfirmPop } from "./ConfirmPop.js";

type FetchApi = (path: string, init?: RequestInit) => Promise<Response>;

type PlayerRow = {
  id: string;
  discordId: string;
  discordUsername: string | null;
  preferredName: string | null;
  bits: number;
  prestigeLevel: number;
};

type BuffRow = { kind: string; expiresAt: string; seriesId: string | null };
type PrestigeRow = { kind: string; stacks: number };
type CooldownRow = { type: string; expiresAt: string };

type PlayerDetail = PlayerRow & {
  milestoneCount: number;
  milestoneProgress: number;
  passiveBitsBonus: number;
  dropsSinceMint: number;
  defaultFrameId: number | null;
  lastGrabbedCardId: string | null;
  buffs: BuffRow[];
  prestigeBuffs: PrestigeRow[];
  cooldowns: CooldownRow[];
};

const BUFFS = [
  ["drop_cooldown", "Drop cooldown"],
  ["grab_cooldown", "Grab cooldown"],
  ["burn_value", "Burn value"],
  ["four_cards", "Four cards"],
  ["shiny_luck", "Shiny luck"],
  ["featured_series", "Featured series"],
  ["quality_over_quantity", "Quality over quantity"],
] as const;

const PRESTIGE = ["burn", "grab", "drop", "mint", "main"] as const;
const COOLDOWNS = ["DROP", "GRAB", "DAILY"] as const;

function toLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Akira couldn't save that.";
}

export function PlayerDesk(props: { fetchApi: FetchApi }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [discordId, setDiscordId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setMessage(null);
    const res = await props.fetchApi(`/admin/players?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    const body = (await res.json()) as { players: PlayerRow[] };
    setRows(body.players);
  }

  async function open(id: string) {
    setMessage(null);
    const res = await props.fetchApi(`/admin/players/${id}`);
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    const body = (await res.json()) as { player: PlayerDetail };
    setAskDelete(false);
    setPlayer(body.player);
  }

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await props.fetchApi("/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordId, discordUsername: newUsername }),
    });
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    const body = (await res.json()) as { player: { id: string } };
    setDiscordId("");
    setNewUsername("");
    setMessage("Player added.");
    await open(body.player.id);
    await search();
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    setMessage(null);
    const res = await props.fetchApi(`/admin/players/${player.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discordUsername: player.discordUsername ?? "",
        preferredName: player.preferredName ?? "",
        bits: player.bits,
        prestigeLevel: player.prestigeLevel,
        milestoneCount: player.milestoneCount,
        milestoneProgress: player.milestoneProgress,
        passiveBitsBonus: player.passiveBitsBonus,
        dropsSinceMint: player.dropsSinceMint,
        defaultFrameId: player.defaultFrameId ?? "",
        lastGrabbedCardId: player.lastGrabbedCardId ?? "",
      }),
    });
    setMessage(res.ok ? "Player saved." : await errorText(res));
    if (res.ok) await open(player.id);
  }

  function stacks(): Record<(typeof PRESTIGE)[number], number> {
    const base = { burn: 0, grab: 0, drop: 0, mint: 0, main: 0 };
    for (const row of player?.prestigeBuffs ?? []) {
      if (row.kind in base) base[row.kind as keyof typeof base] = row.stacks;
    }
    return base;
  }

  async function savePrestige(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    setMessage(null);
    const res = await props.fetchApi(`/admin/players/${player.id}/prestige`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stacks()),
    });
    setMessage(res.ok ? "Prestige saved." : await errorText(res));
  }

  async function saveBuffs() {
    if (!player) return;
    if (player.buffs.some((buff) => Number.isNaN(new Date(buff.expiresAt).getTime()))) {
      setMessage("Each buff needs an end time.");
      return;
    }
    setMessage(null);
    const res = await props.fetchApi(`/admin/players/${player.id}/buffs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buffs: player.buffs.map((buff) => ({
          kind: buff.kind,
          expiresAt: new Date(buff.expiresAt).toISOString(),
          seriesId: buff.seriesId,
        })),
      }),
    });
    setMessage(res.ok ? "Buffs saved." : await errorText(res));
    if (res.ok) await open(player.id);
  }

  async function saveCooldowns(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    setMessage(null);
    const body: Record<string, string | null> = {};
    for (const type of COOLDOWNS) {
      const row = player.cooldowns.find((cooldown) => cooldown.type === type);
      body[type] = row?.expiresAt ? new Date(row.expiresAt).toISOString() : null;
    }
    const res = await props.fetchApi(`/admin/players/${player.id}/cooldowns`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(res.ok ? "Cooldowns saved." : await errorText(res));
    if (res.ok) await open(player.id);
  }

  async function removePlayer() {
    if (!player || deleting) return;
    setDeleting(true);
    const res = await props.fetchApi(`/admin/players/${player.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      setMessage(await errorText(res));
      return;
    }
    setAskDelete(false);
    setPlayer(null);
    setMessage("Player deleted.");
    await search();
  }

  useEffect(() => {
    void search();
  }, []);

  const prestige = stacks();

  return (
    <div>
      {message ? <p className="admin-note" role="status">{message}</p> : null}
      {askDelete && player ? (
        <ConfirmPop
          title={`Delete ${player.discordUsername ?? player.discordId}?`}
          body="Their cards stay in the database with no owner."
          confirmLabel={deleting ? "Deleting…" : "Delete player"}
          busy={deleting}
          onConfirm={() => void removePlayer()}
          onCancel={() => { if (!deleting) setAskDelete(false); }}
        />
      ) : null}
      <div className="panel">
        <h3>Find a player</h3>
        <form onSubmit={(e) => void search(e)}>
          <label>
            Username, Discord id, or name
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="submit">Search</button>
        </form>
        {rows.map((row) => (
          <button key={row.id} type="button" className="admin-pick" onClick={() => void open(row.id)}>
            <span>{row.discordUsername ?? row.preferredName ?? row.discordId}</span>
            <span className="admin-meta">
              {row.bits.toLocaleString("en-US")} bits · prestige {row.prestigeLevel}
            </span>
          </button>
        ))}
      </div>

      <div className="panel">
        <h3>Add a player</h3>
        <form onSubmit={(e) => void createPlayer(e)}>
          <div className="admin-grid">
            <label>
              Discord id
              <input value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="639906782658953256" />
            </label>
            <label>
              Discord username
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="thepotatogamer" />
            </label>
          </div>
          <button type="submit">Add player</button>
        </form>
      </div>

      {player ? (
        <>
          <div className="panel">
            <h3>{player.discordUsername ?? player.discordId}</h3>
            <p className="admin-meta">Discord id {player.discordId}</p>
            <form onSubmit={(e) => void saveProfile(e)}>
              <div className="admin-grid">
                <label>
                  Discord username
                  <input
                    value={player.discordUsername ?? ""}
                    onChange={(e) => setPlayer({ ...player, discordUsername: e.target.value })}
                  />
                </label>
                <label>
                  Preferred name
                  <input
                    value={player.preferredName ?? ""}
                    onChange={(e) => setPlayer({ ...player, preferredName: e.target.value })}
                  />
                </label>
                <label>
                  Bits
                  <input
                    type="number"
                    value={player.bits}
                    onChange={(e) => setPlayer({ ...player, bits: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Prestige level
                  <input
                    type="number"
                    value={player.prestigeLevel}
                    onChange={(e) => setPlayer({ ...player, prestigeLevel: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Milestones claimed
                  <input
                    type="number"
                    value={player.milestoneCount}
                    onChange={(e) => setPlayer({ ...player, milestoneCount: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Milestone progress
                  <input
                    type="number"
                    value={player.milestoneProgress}
                    onChange={(e) => setPlayer({ ...player, milestoneProgress: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Daily bonus
                  <input
                    type="number"
                    value={player.passiveBitsBonus}
                    onChange={(e) => setPlayer({ ...player, passiveBitsBonus: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Drops since a mint
                  <input
                    type="number"
                    value={player.dropsSinceMint}
                    onChange={(e) => setPlayer({ ...player, dropsSinceMint: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Personal frame id
                  <input
                    value={player.defaultFrameId ?? ""}
                    onChange={(e) =>
                      setPlayer({
                        ...player,
                        defaultFrameId: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="Empty uses the server frame"
                  />
                </label>
                <label>
                  Last grabbed card
                  <input
                    value={player.lastGrabbedCardId ?? ""}
                    onChange={(e) => setPlayer({ ...player, lastGrabbedCardId: e.target.value })}
                  />
                </label>
              </div>
              <button type="submit">Save player</button>
              <button type="button" className="secondary" onClick={() => setAskDelete(true)}>
                Delete player
              </button>
            </form>
          </div>

          <div className="panel">
            <h3>Prestige</h3>
            <form onSubmit={(e) => void savePrestige(e)}>
              <div className="admin-grid">
                {PRESTIGE.map((kind) => (
                  <label key={kind}>
                    {kind}
                    <input
                      type="number"
                      value={prestige[kind]}
                      onChange={(e) =>
                        setPlayer({
                          ...player,
                          prestigeBuffs: PRESTIGE.map((name) => ({
                            kind: name,
                            stacks: name === kind ? Number(e.target.value) : prestige[name],
                          })),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button type="submit">Save prestige</button>
            </form>
          </div>

          <div className="panel">
            <h3>Buffs</h3>
            {player.buffs.map((buff, index) => (
              <div className="admin-grid" key={`${buff.kind}-${index}`}>
                <label>
                  Buff
                  <select
                    value={buff.kind}
                    onChange={(e) => {
                      const buffs = player.buffs.slice();
                      const current = buffs[index];
                      if (!current) return;
                      buffs[index] = { ...current, kind: e.target.value };
                      setPlayer({ ...player, buffs });
                    }}
                  >
                    {BUFFS.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ends
                  <input
                    type="datetime-local"
                    value={toLocal(buff.expiresAt)}
                    onChange={(e) => {
                      const buffs = player.buffs.slice();
                      const current = buffs[index];
                      if (!current) return;
                      buffs[index] = { ...current, expiresAt: e.target.value };
                      setPlayer({ ...player, buffs });
                    }}
                  />
                </label>
                <label>
                  Series id
                  <input
                    value={buff.seriesId ?? ""}
                    onChange={(e) => {
                      const buffs = player.buffs.slice();
                      const current = buffs[index];
                      if (!current) return;
                      buffs[index] = { ...current, seriesId: e.target.value || null };
                      setPlayer({ ...player, buffs });
                    }}
                    placeholder="Series slug, for featured series"
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPlayer({ ...player, buffs: player.buffs.filter((_, i) => i !== index) })}
                >
                  Remove buff
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setPlayer({
                  ...player,
                  buffs: [
                    ...player.buffs,
                    { kind: "drop_cooldown", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), seriesId: null },
                  ],
                })
              }
            >
              Add buff
            </button>
            <button type="button" onClick={() => void saveBuffs()}>
              Save buffs
            </button>
          </div>

          <div className="panel">
            <h3>Cooldowns</h3>
            <form onSubmit={(e) => void saveCooldowns(e)}>
              <div className="admin-grid">
                {COOLDOWNS.map((type) => {
                  const row = player.cooldowns.find((cooldown) => cooldown.type === type);
                  return (
                    <label key={type}>
                      {type.toLowerCase()}
                      <input
                        type="datetime-local"
                        value={toLocal(row?.expiresAt)}
                        onChange={(e) => {
                          const rest = player.cooldowns.filter((cooldown) => cooldown.type !== type);
                          setPlayer({
                            ...player,
                            cooldowns: e.target.value ? [...rest, { type, expiresAt: e.target.value }] : rest,
                          });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              <button type="submit">Save cooldowns</button>
            </form>
            <p className="admin-meta">Leave a time empty to clear that cooldown.</p>
          </div>
        </>
      ) : null}

    </div>
  );
}
