export type FarmArgs = {
  url: string;
  token: string;
};

function asUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\d+\.\d+\.\d+\.\d+(?::\d+)?$/.test(trimmed) || /^[a-z0-9.-]+:\d+$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return "";
}

export function parseFarmArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): FarmArgs {
  let url = asUrl(env["AKIRA_FARM_URL"] ?? "");
  let token = (env["AKIRA_FARM_TOKEN"] ?? "").trim();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--url") {
      url = asUrl(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (arg === "--token") {
      token = (argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--url=")) {
      url = asUrl(arg.slice("--url=".length));
      continue;
    }
    if (arg.startsWith("--token=")) {
      token = arg.slice("--token=".length).trim();
      continue;
    }
    if (arg.startsWith("-")) continue;
    const parsed = asUrl(arg);
    if (parsed) {
      url = parsed;
      continue;
    }
    if (!token) token = arg.trim();
  }
  return { url: url.replace(/\/$/, ""), token };
}
