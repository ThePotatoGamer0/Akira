import type { AkiraCommand } from "../../types/commands.js";
import { burn } from "./burn.js";
import { collection } from "./collection.js";
import { cooldowns } from "./cooldowns.js";
import { daily } from "./daily.js";
import { drop } from "./drop.js";
import { frame } from "./frame.js";
import { help } from "./help.js";
import {
  dye,
  give,
  importCsv,
  inventory,
  multiburn,
  pool,
  shop,
  tags,
  trade,
} from "./later.js";
import { reminders } from "./reminders.js";
import { lookup } from "./lookup.js";
import { ping } from "./ping.js";
import { userinfo } from "./userinfo.js";
import { view } from "./view.js";
import { wishlist } from "./wishlist.js";

export const commands: AkiraCommand[] = [
  ping,
  help,
  drop,
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
  frame,
  inventory,
];

export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
