import { spawn } from "node:child_process";
import { REPO_ROOT } from "./repo-root.js";

export function runGenerateDetached(): void {
  const root = process.env["AKIRA_REPO_ROOT"] ?? REPO_ROOT;
  const proc = spawn("npm", ["run", "generate"], {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  proc.on("close", (code) => {
    if (code !== 0) console.error(`[webui] Asset generation exited with ${code}`);
    else console.log("[webui] Asset generation finished.");
  });
}
