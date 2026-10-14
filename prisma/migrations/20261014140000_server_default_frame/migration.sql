-- Cards and drops with no chosen frame follow the server default.
-- Existing rows were all stamped with frame 0 automatically, so they become unset.
ALTER TABLE "GuildConfig" ADD COLUMN "defaultFrameId" INTEGER NOT NULL DEFAULT 0;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "frameId" INTEGER,
    "printNumber" INTEGER NOT NULL,
    "quality" TEXT NOT NULL,
    "ownerId" TEXT,
    "tag" TEXT,
    "alias" TEXT,
    "dye" TEXT,
    "obtainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Card_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("id", "variantId", "frameId", "printNumber", "quality", "ownerId", "tag", "alias", "dye", "obtainedAt")
SELECT "id", "variantId", NULL, "printNumber", "quality", "ownerId", "tag", "alias", "dye", "obtainedAt" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_ownerId_idx" ON "Card"("ownerId");
CREATE INDEX "Card_variantId_frameId_idx" ON "Card"("variantId", "frameId");

CREATE TABLE "new_DropSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dropId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "variantId" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "frameId" INTEGER,
    "claimedById" TEXT,
    "cardId" TEXT,
    CONSTRAINT "DropSlot_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DropSlot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DropSlot_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DropSlot_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DropSlot" ("id", "dropId", "position", "variantId", "quality", "frameId", "claimedById", "cardId")
SELECT "id", "dropId", "position", "variantId", "quality", NULL, "claimedById", "cardId" FROM "DropSlot";
DROP TABLE "DropSlot";
ALTER TABLE "new_DropSlot" RENAME TO "DropSlot";
CREATE UNIQUE INDEX "DropSlot_cardId_key" ON "DropSlot"("cardId");
CREATE UNIQUE INDEX "DropSlot_dropId_position_key" ON "DropSlot"("dropId", "position");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
