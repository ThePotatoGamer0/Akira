-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "discordUsername" TEXT,
    "passwordHash" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "bits" INTEGER NOT NULL DEFAULT 0,
    "prestigeLevel" INTEGER NOT NULL DEFAULT 0,
    "milestoneCount" INTEGER NOT NULL DEFAULT 0,
    "milestoneProgress" INTEGER NOT NULL DEFAULT 0,
    "passiveBitsBonus" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("bits", "discordId", "id", "milestoneCount", "milestoneProgress", "passiveBitsBonus", "prestigeLevel") SELECT "bits", "discordId", "id", "milestoneCount", "milestoneProgress", "passiveBitsBonus", "prestigeLevel" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
CREATE UNIQUE INDEX "User_discordUsername_key" ON "User"("discordUsername");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
