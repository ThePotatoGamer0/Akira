export type OriginRule =
  | { kind: "exact"; origin: string }
  | { kind: "wildcard"; protocol: string; host: string };

/** `https://*.potatogamer.uk` or a full address. A bad entry is skipped. */
export function parseOriginList(raw: string): OriginRule[] {
  const rules: OriginRule[] = [];
  for (const entry of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
    const rule = parseOriginRule(entry);
    if (rule) rules.push(rule);
  }
  return rules;
}

function parseOriginRule(entry: string): OriginRule | null {
  const wildcard = /^([a-z][a-z0-9+.-]*):\/\/\*\.([^/:]+)$/i.exec(entry);
  if (wildcard) {
    const protocol = `${wildcard[1]!.toLowerCase()}:`;
    const host = wildcard[2]!.toLowerCase();
    if (!host.includes("*") && !host.startsWith(".") && !host.endsWith(".")) {
      return { kind: "wildcard", protocol, host };
    }
    return null;
  }
  try {
    return { kind: "exact", origin: new URL(entry).origin };
  } catch {
    return null;
  }
}

export function originAllowed(origin: string, rules: readonly OriginRule[], defaults: readonly string[]): boolean {
  if (defaults.includes(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith("discordsays.com")) return true;
  return rules.some((rule) => matches(url, host, rule));
}

function matches(url: URL, host: string, rule: OriginRule): boolean {
  if (rule.kind === "exact") return url.origin === rule.origin;
  if (url.protocol !== rule.protocol) return false;
  return host === rule.host || host.endsWith(`.${rule.host}`);
}

/** An https client on another host needs a cross-site login cookie. */
export function allowsCrossSite(rules: readonly OriginRule[]): boolean {
  return rules.some((rule) => {
    if (rule.kind === "wildcard") return rule.protocol === "https:" && rule.host !== "localhost";
    try {
      const url = new URL(rule.origin);
      return url.protocol === "https:" && url.hostname !== "localhost";
    } catch {
      return false;
    }
  });
}
