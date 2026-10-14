import assert from "node:assert/strict";
import test from "node:test";
import { parseReminderAction, reminderLine } from "./reminders.js";

test("reminder actions are the cooldowns akira actually has", () => {
  assert.equal(parseReminderAction("Drop"), "drop");
  assert.equal(parseReminderAction("grab"), "grab");
  assert.equal(parseReminderAction("daily"), "daily");
  assert.equal(parseReminderAction("vote"), null);
  assert.equal(parseReminderAction("work"), null);
});

test("reminder lines show whether the ping is on", () => {
  assert.equal(reminderLine("drop", true, 0), "🔔 **Drop** is ready");
  assert.equal(reminderLine("grab", false, 5 * 60_000), "🔕 **Grab** is available in `5 minutes`");
});
