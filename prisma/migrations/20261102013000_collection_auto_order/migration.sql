-- The collection opens on Auto, which hands a search to the ranker. Players who
-- never chose an order were on the default, so they move over too. SQLite cannot
-- change a column default in place, so the table is rebuilt with the new one.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "discordUsername" TEXT,
    "discordAvatar" TEXT,
    "preferredName" TEXT,
    "passwordHash" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bits" INTEGER NOT NULL DEFAULT 0,
    "prestigeLevel" INTEGER NOT NULL DEFAULT 0,
    "milestoneCount" INTEGER NOT NULL DEFAULT 0,
    "milestoneProgress" INTEGER NOT NULL DEFAULT 0,
    "passiveBitsBonus" INTEGER NOT NULL DEFAULT 0,
    "lastGrabbedCardId" TEXT,
    "dropsSinceMint" INTEGER NOT NULL DEFAULT 0,
    "defaultFrameId" INTEGER,
    "collectionOrder" TEXT NOT NULL DEFAULT 'auto',
    "continuousScroll" BOOLEAN NOT NULL DEFAULT false,
    "seriesTitle" TEXT NOT NULL DEFAULT 'english'
);
INSERT INTO "new_User" ("id", "discordId", "discordUsername", "discordAvatar", "preferredName", "passwordHash", "isAdmin", "createdAt", "bits", "prestigeLevel", "milestoneCount", "milestoneProgress", "passiveBitsBonus", "lastGrabbedCardId", "dropsSinceMint", "defaultFrameId", "collectionOrder", "continuousScroll", "seriesTitle")
SELECT "id", "discordId", "discordUsername", "discordAvatar", "preferredName", "passwordHash", "isAdmin", "createdAt", "bits", "prestigeLevel", "milestoneCount", "milestoneProgress", "passiveBitsBonus", "lastGrabbedCardId", "dropsSinceMint", "defaultFrameId", CASE WHEN "collectionOrder" = 'character' THEN 'auto' ELSE "collectionOrder" END, "continuousScroll", "seriesTitle" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
CREATE UNIQUE INDEX "User_discordUsername_key" ON "User"("discordUsername");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
