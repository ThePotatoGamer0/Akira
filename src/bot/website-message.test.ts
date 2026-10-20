import assert from "node:assert/strict";
import test from "node:test";
import { readSpeakerMark, speakerIdForName, type NamedAccount } from "./website-message.js";

const james: NamedAccount = {
  discordId: "639906782658953256",
  username: "thepotatogamer",
  displayName: "James (Sono, Yarichin, CyberP)",
  globalName: "James",
};

test("older website messages still hide the speaker tail on the website", () => {
  const content = `adrop\u200b\u200c\u200dabcd1234:639906782658953256\u200d\u200c\u200b`;
  assert.deepEqual(readSpeakerMark(content), {
    text: "adrop",
    key: "abcd1234",
    discordId: "639906782658953256",
  });
  assert.deepEqual(readSpeakerMark("hello"), { text: "hello", key: null, discordId: null });
});

test("the Discord username on the message is that player", () => {
  assert.equal(speakerIdForName("thepotatogamer", [james]), james.discordId);
  assert.equal(speakerIdForName("ThePotatoGamer", [james]), james.discordId);
  assert.equal(speakerIdForName("someone else", [james]), null);
});

test("a shared display name is not guessed", () => {
  const other: NamedAccount = { ...james, discordId: "111111111111111111", username: "other" };
  assert.equal(speakerIdForName("James (Sono, Yarichin, CyberP)", [james, other]), null);
  assert.equal(speakerIdForName("thepotatogamer", [james, other]), james.discordId);
});
