-- Character profile columns used by the catalog seeder.
ALTER TABLE "Character" ADD COLUMN "description" TEXT;
ALTER TABLE "Character" ADD COLUMN "gender" TEXT;
ALTER TABLE "Character" ADD COLUMN "aliases" TEXT;

-- CreateTable
CREATE TABLE "CardVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    CONSTRAINT "CardVariant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Recreate Card around variantId. Existing rows pointed at characters, not variants,
-- and this project has no production card inventory to preserve.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "frameId" INTEGER NOT NULL,
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
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_ownerId_idx" ON "Card"("ownerId");
CREATE INDEX "Card_variantId_frameId_idx" ON "Card"("variantId", "frameId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "GuildConfig" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "dropChannelId" TEXT
);

-- CreateTable
CREATE TABLE "PrintCounter" (
    "variantId" TEXT NOT NULL PRIMARY KEY,
    "nextPrint" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PrintCounter_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DropSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dropId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "variantId" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "frameId" INTEGER NOT NULL,
    "claimedById" TEXT,
    "cardId" TEXT,
    CONSTRAINT "DropSlot_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DropSlot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DropSlot_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DropSlot_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Drop_messageId_key" ON "Drop"("messageId");

-- CreateIndex
CREATE INDEX "Drop_guildId_idx" ON "Drop"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "DropSlot_cardId_key" ON "DropSlot"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "DropSlot_dropId_position_key" ON "DropSlot"("dropId", "position");
