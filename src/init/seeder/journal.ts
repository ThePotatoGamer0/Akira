import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../utils/paths.js";

/**
 * One line saying what the last init deleted from the catalog. The site writes its own changelog,
 * so this is kept apart from those pages and left alone if the folder was never set up.
 */
export async function writeJournal(line: string): Promise<void> {
  // The site builds every .md here as a page, so these notes stay out of the way in docs/.
  try {
    const notes = path.join(ROOT, "docs", "catalog-notes.md");
    fs.appendFileSync(notes, `- ${new Date().toISOString().slice(0, 10)}: Removed ${line} from the catalog.\n`);
  } catch (err) {
    console.warn("Could not write the catalog journal.", err);
  }
}
