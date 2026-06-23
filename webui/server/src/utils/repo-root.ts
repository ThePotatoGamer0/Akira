import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (three levels above `webui/server/src/utils`). */
export const REPO_ROOT = path.join(here, "..", "..", "..", "..");
