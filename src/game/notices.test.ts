import assert from "node:assert/strict";
import test from "node:test";
import { cooldownNoticeText } from "./notices.js";

test("a webui notice uses the same words as the discord ping", () => {
  assert.equal(cooldownNoticeText("DROP"), "Drop is ready.");
  assert.equal(cooldownNoticeText("GRAB"), "Grab is ready.");
  assert.equal(cooldownNoticeText("DAILY"), "Daily is ready.");
});
