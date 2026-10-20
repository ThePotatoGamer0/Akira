import assert from "node:assert/strict";
import test from "node:test";
import { claimSpeaker, readSpeakerMark, stageSpeaker } from "./website-message.js";

test("a website message keeps a hidden speaker mark the chat does not show", () => {
  const content = `adrop\u200b\u200c\u200dabcd1234:639906782658953256\u200d\u200c\u200b`;
  assert.deepEqual(readSpeakerMark(content), {
    text: "adrop",
    key: "abcd1234",
    discordId: "639906782658953256",
  });
  assert.deepEqual(readSpeakerMark("hello"), { text: "hello", key: null, discordId: null });
});

test("a speaker mark only counts when this process just posted it", () => {
  const content = `hello\u200b\u200c\u200dabcd1234:639906782658953256\u200d\u200c\u200b`;
  assert.equal(claimSpeaker(content, 0), null);
  stageSpeaker("abcd1234", "639906782658953256", "adrop", 0);
  assert.equal(claimSpeaker(`adrop\u200b\u200c\u200dabcd1234:639906782658953256\u200d\u200c\u200b`, 0), "639906782658953256");
  assert.equal(claimSpeaker(`adrop\u200b\u200c\u200dabcd1234:639906782658953256\u200d\u200c\u200b`, 0), null);
});

test("a forged speaker id does not take over a pending message", () => {
  stageSpeaker("abcd1235", "111111111111111111", "adrop", 0);
  assert.equal(claimSpeaker(`adrop\u200b\u200c\u200dabcd1235:222222222222222222\u200d\u200c\u200b`, 0), null);
});

test("a message still resolves when Discord drops the hidden mark", () => {
  stageSpeaker("abcd1236", "111111111111111111", "adrop", 1);
  assert.equal(claimSpeaker("adrop", 1), "111111111111111111");
});
