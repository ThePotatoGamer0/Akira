-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    CONSTRAINT "Character_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "frameId" INTEGER NOT NULL,
    "printNumber" INTEGER NOT NULL,
    "quality" TEXT NOT NULL,
    "ownerId" TEXT,
    "tag" TEXT,
    "alias" TEXT,
    "dye" TEXT,
    "obtainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Card_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "bits" INTEGER NOT NULL DEFAULT 0,
    "prestigeLevel" INTEGER NOT NULL DEFAULT 0,
    "milestoneCount" INTEGER NOT NULL DEFAULT 0,
    "milestoneProgress" INTEGER NOT NULL DEFAULT 0,
    "passiveBitsBonus" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    CONSTRAINT "Wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Wishlist_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerPool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "totalBits" INTEGER NOT NULL DEFAULT 0,
    "lastReset" DATETIME,
    "activeBuff" TEXT,
    "buffTier" INTEGER NOT NULL DEFAULT 0,
    "buffExpiry" DATETIME
);

-- CreateTable
CREATE TABLE "UserPoolContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "bits" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    CONSTRAINT "UserPoolContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Inventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cooldown" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Cooldown_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Character_seriesId_slug_key" ON "Character"("seriesId", "slug");

-- CreateIndex
CREATE INDEX "Card_ownerId_idx" ON "Card"("ownerId");

-- CreateIndex
CREATE INDEX "Card_characterId_frameId_idx" ON "Card"("characterId", "frameId");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_userId_characterId_key" ON "Wishlist"("userId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerPool_guildId_key" ON "ServerPool"("guildId");

-- CreateIndex
CREATE INDEX "UserPoolContribution_userId_guildId_date_idx" ON "UserPoolContribution"("userId", "guildId", "date");

-- CreateIndex
CREATE INDEX "Inventory_userId_idx" ON "Inventory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_userId_itemType_key" ON "Inventory"("userId", "itemType");

-- CreateIndex
CREATE UNIQUE INDEX "Cooldown_userId_type_key" ON "Cooldown"("userId", "type");
