import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCirculation } from "./cards.js";

const james = {
  discordId: "639906782658953256",
  discordAvatar: "abc123",
  preferredName: "James",
  discordUsername: "thepotatogamer",
} as const;

const potato = {
  discordId: "123456789012345678",
  discordAvatar: "",
  preferredName: null,
  discordUsername: "potato",
} as const;

test("circulation lists each print's holder beside the quality count", () => {
  const summary = summarizeCirculation(
    5,
    [
      {
        id: "legend3",
        printNumber: 3,
        quality: "LEGENDARY",
        ownerId: "james",
        owner: james,
      },
      {
        id: "common1",
        printNumber: 1,
        quality: "COMMON",
        ownerId: null,
        owner: null,
      },
      {
        id: "legend2",
        printNumber: 2,
        quality: "LEGENDARY",
        ownerId: "friend",
        owner: potato,
      },
    ],
    "james",
  );

  assert.equal(summary.generated, 4);
  assert.equal(summary.circulation, 3);
  assert.equal(summary.byQuality.COMMON, 1);
  assert.equal(summary.byQuality.LEGENDARY, 2);
  assert.deepEqual(
    summary.holders.map((holder) => ({
      cardId: holder.cardId,
      ownerId: holder.ownerId,
      printNumber: holder.printNumber,
      quality: holder.quality,
      ownerName: holder.ownerName,
      avatarUrl: holder.avatarUrl,
      mine: holder.mine,
    })),
    [
      { cardId: "common1", ownerId: null, printNumber: 1, quality: "COMMON", ownerName: "Unclaimed", avatarUrl: null, mine: false },
      {
        cardId: "legend2",
        ownerId: "friend",
        printNumber: 2,
        quality: "LEGENDARY",
        ownerName: "potato",
        avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
        mine: false,
      },
      {
        cardId: "legend3",
        ownerId: "james",
        printNumber: 3,
        quality: "LEGENDARY",
        ownerName: "James",
        avatarUrl: "https://cdn.discordapp.com/avatars/639906782658953256/abc123.png?size=64",
        mine: true,
      },
    ],
  );
});

test("circulation keeps one face per owner and the lowest print they hold", () => {
  const summary = summarizeCirculation(
    9,
    [
      {
        id: "legend8",
        printNumber: 8,
        quality: "LEGENDARY",
        ownerId: "james",
        owner: james,
      },
      {
        id: "legend3",
        printNumber: 3,
        quality: "LEGENDARY",
        ownerId: "james",
        owner: james,
      },
      {
        id: "legend2",
        printNumber: 2,
        quality: "LEGENDARY",
        ownerId: "friend",
        owner: potato,
      },
    ],
    "james",
  );

  assert.equal(summary.circulation, 3);
  assert.equal(summary.byQuality.LEGENDARY, 3);
  assert.deepEqual(
    summary.holders.map((holder) => ({ cardId: holder.cardId, ownerId: holder.ownerId, printNumber: holder.printNumber })),
    [
      { cardId: "legend2", ownerId: "friend", printNumber: 2 },
      { cardId: "legend3", ownerId: "james", printNumber: 3 },
    ],
  );
});

test("circulation with no prints is empty", () => {
  const summary = summarizeCirculation(null, []);
  assert.deepEqual(summary, { generated: 0, circulation: 0, byQuality: {}, holders: [] });
});
