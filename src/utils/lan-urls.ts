import fs from "node:fs";
import os from "node:os";

const HOST_FIB = "/host/fib_trie";

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

/** Docker and typical container bridges. A PC on wifi cannot use these. */
export function isContainerIpv4(ip: string): boolean {
  const parts = ipv4Parts(ip);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 172 && (b ?? 0) >= 16 && (b ?? 0) <= 31) return true;
  if (ip === "172.17.0.1" || ip.startsWith("172.18.") || ip.startsWith("172.19.")) return true;
  return false;
}

export function isLanIpv4(ip: string): boolean {
  const parts = ipv4Parts(ip);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 127 || ip.startsWith("169.254.")) return false;
  if (isContainerIpv4(ip)) return false;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** `/32 host LOCAL` rows in Linux fib_trie are addresses on this machine. */
export function ipv4sFromFibTrie(text: string): string[] {
  const ips: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /\|\-\-\s*(\d+\.\d+\.\d+\.\d+)\s*$/.exec(lines[index] ?? "");
    if (!match?.[1]) continue;
    const next = lines[index + 1] ?? "";
    if (!/\/32\s+host\s+LOCAL/i.test(next)) continue;
    const ip = match[1];
    if (!ips.includes(ip)) ips.push(ip);
  }
  return ips;
}

function ipsFromInterfaces(nics: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string[] {
  const ips: string[] = [];
  for (const addrs of Object.values(nics)) {
    for (const addr of addrs ?? []) {
      const family = addr.family;
      if (family !== "IPv4") continue;
      if (addr.internal) continue;
      if (!ips.includes(addr.address)) ips.push(addr.address);
    }
  }
  return ips;
}

function originFrom(value: string, port: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.port) url.port = String(port);
    return url.origin;
  } catch {
    return null;
  }
}

function sortLan(ips: string[]): string[] {
  return [...ips].sort((left, right) => {
    const leftHome = left.startsWith("192.168.") ? 0 : 1;
    const rightHome = right.startsWith("192.168.") ? 0 : 1;
    if (leftHome !== rightHome) return leftHome - rightHome;
    return left.localeCompare(right, "en");
  });
}

export type FarmUrlOptions = {
  env?: NodeJS.ProcessEnv;
  interfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>;
  fibTrie?: string | null;
  port?: number;
};

/** Addresses a PC on the same wifi should try, wifi first. */
export function farmAdvertisedUrls(options: FarmUrlOptions = {}): string[] {
  const env = options.env ?? process.env;
  const port = options.port ?? (Number(env["WEBUI_SERVER_PORT"] ?? "3333") || 3333);
  const seen = new Set<string>();
  const urls: string[] = [];
  const add = (value: string | null) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    urls.push(value);
  };

  add(originFrom(env["AKIRA_FARM_URL"] ?? "", port));

  let fib = options.fibTrie;
  if (fib === undefined) {
    try {
      fib = fs.readFileSync(HOST_FIB, "utf8");
    } catch {
      fib = null;
    }
  }
  const fromFib = fib ? ipv4sFromFibTrie(fib).filter(isLanIpv4) : [];
  const fromNics = ipsFromInterfaces(options.interfaces ?? os.networkInterfaces()).filter(isLanIpv4);
  for (const ip of sortLan([...fromFib, ...fromNics])) add(`http://${ip}:${port}`);

  return urls;
}

export function farmCopyUrl(urls: string[]): string | null {
  return urls[0] ?? null;
}
