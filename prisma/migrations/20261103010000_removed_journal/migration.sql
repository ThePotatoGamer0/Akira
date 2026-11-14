-- A card keeps the variant id it was minted from, so it can outlive that variant's entry in input/.
ALTER TABLE "Card" ADD COLUMN "assetKey" TEXT;
UPDATE "Card" SET "assetKey" = "variantId" WHERE "assetKey" IS NULL;

-- Cards no longer cascade-delete with their variant: a deleted edition releases owned copies and
-- deletes unclaimed ones itself, so the old cascade has to go. SQLite wants the table rebuilt.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT,
    "assetKey" TEXT,
    "frameId" INTEGER,
    "printNumber" INTEGER NOT NULL,
    "quality" TEXT NOT NULL,
    "ownerId" TEXT,
    "tag" TEXT,
    "alias" TEXT,
    "dye" TEXT,
    "obtainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Card_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("id", "variantId", "assetKey", "frameId", "printNumber", "quality", "ownerId", "tag", "alias", "dye", "obtainedAt") SELECT "id", "variantId", "assetKey", "frameId", "printNumber", "quality", "ownerId", "tag", "alias", "dye", "obtainedAt" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_ownerId_idx" ON "Card"("ownerId");
CREATE INDEX "Card_variantId_frameId_idx" ON "Card"("variantId", "frameId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- What a deleted edition left behind, so the website can report it.
CREATE TABLE "RemovedCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "cardId" TEXT,
    "characterName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "seriesName" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "cacheFolder" TEXT NOT NULL,
    "removedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RemovedCard_removedAt_idx" ON "RemovedCard"("removedAt");
