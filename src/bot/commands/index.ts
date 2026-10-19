import type { AkiraCommand } from "../../types/commands.js";
import { burn } from "./burn.js";
import { collection } from "./collection.js";
import { cooldowns } from "./cooldowns.js";
import { compensate } from "./compensate.js";
import { daily } from "./daily.js";
import { drop } from "./drop.js";
import { frame } from "./frame.js";
import { help } from "./help.js";
import { dye, importCsv } from "./later.js";
import { inventory } from "./inventory.js";
import { milestone } from "./milestone.js";
import { pool } from "./pool.js";
import { prestige } from "./prestige.js";
import { set } from "./set.js";
import { shop } from "./shop.js";
import { multiburn } from "./multiburn.js";
import { tag, tagcreate, tagdelete, taglist, untag } from "./tag.js";
import { multitrade } from "./multitrade.js";
import { give, trade } from "./transfer.js";
import { reminders } from "./reminders.js";
import { lookup } from "./lookup.js";
import { ping } from "./ping.js";
import { userinfo } from "./userinfo.js";
import { view } from "./view.js";
import { wishlist } from "./wishlist.js";
import { checklist } from "./checklist.js";

export const commands: AkiraCommand[] = [
  ping,
  help,
  drop,
  collection,
  view,
  burn,
  multiburn,
  daily,
  compensate,
  cooldowns,
  lookup,
  reminders,
  importCsv,
  tag,
  taglist,
  tagcreate,
  tagdelete,
  untag,
  wishlist,
  checklist,
  give,
  trade,
  multitrade,
  userinfo,
  shop,
  pool,
  milestone,
  prestige,
  dye,
  frame,
  inventory,
  set,
];

export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
