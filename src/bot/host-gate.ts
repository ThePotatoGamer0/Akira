import { DiscordAPIError, type Guild } from "discord.js";

/** Collaborative commands only run in servers this member belongs to. */
export const HOST_DISCORD_ID = "639906782658953256";

const COLLABORATIVE: Record<string, string> = {
  drop: "drop",
  pool: "use the server pool",
  set: "set a drop channel",
};

const presence = new Map<string, { at: number; present: boolean }>();
const PRESENCE_MS = 30_000;

export function collaborativeAction(commandName: string): string | null {
  return COLLABORATIVE[commandName] ?? null;
}

export function privateServerMessage(action: string): string {
  return `You cannot ${action} in a private server`;
}

function unknownMember(err: unknown): boolean {
  if (err instanceof DiscordAPIError && (err.code === 10007 || err.status === 404)) return true;
  return typeof err === "object" && err !== null && "code" in err && err.code === 10007;
}

/** True when the host is in the member list. A missing guild is a private server. Transient lookup errors stay open. */
export async function hostIsInGuild(guild: Guild | null): Promise<boolean> {
  if (!guild) return false;
  if (guild.members.cache.has(HOST_DISCORD_ID)) {
    presence.set(guild.id, { at: Date.now(), present: true });
    return true;
  }
  const cached = presence.get(guild.id);
  if (cached && Date.now() - cached.at < PRESENCE_MS) return cached.present;
  try {
    await guild.members.fetch(HOST_DISCORD_ID);
    presence.set(guild.id, { at: Date.now(), present: true });
    return true;
  } catch (err) {
    if (unknownMember(err)) {
      presence.set(guild.id, { at: Date.now(), present: false });
      return false;
    }
    console.error("Couldn't check the member list.", err);
    return true;
  }
}
