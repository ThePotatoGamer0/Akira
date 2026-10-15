-- AlterTable
ALTER TABLE "Character" ADD COLUMN "role" TEXT;

-- CreateTable
CREATE TABLE "Buff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "seriesId" TEXT,
    CONSTRAINT "Buff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrestigeBuff" (
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stacks" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PrestigeBuff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("userId", "kind")
);

-- CreateTable
CREATE TABLE "FeaturedSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Buff_userId_kind_key" ON "Buff"("userId", "kind");

-- CreateIndex
CREATE INDEX "Buff_userId_idx" ON "Buff"("userId");

UPDATE "Character" SET "role" = 'MAIN' WHERE "slug" = 'drippy' AND "role" IS NULL;
