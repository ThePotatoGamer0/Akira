import type { AkiraCommand } from "../../types/commands.js";
import { help } from "./help.js";
import { ping } from "./ping.js";
import {
  burn,
  collection,
  cooldowns,
  daily,
  drop,
  grab,
  importCsv,
  lookup,
  multiburn,
  reminders,
  view,
} from "./phase1.js";
import { give, tags, trade, userinfo, wishlist } from "./phase2.js";
import { dye, frameCmd, inventory, pool, shop } from "./phase3.js";

export const commands: AkiraCommand[] = [
  ping,
  help,
  drop,
  grab,
  collection,
  view,
  burn,
  multiburn,
  daily,
  cooldowns,
  lookup,
  reminders,
  importCsv,
  tags,
  wishlist,
  give,
  trade,
  userinfo,
  shop,
  pool,
  dye,
  frameCmd,
  inventory,
];

export const commandMap = new Map(commands.map((c) => [c.data.name, c]));
