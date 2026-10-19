-- Last heartbeat, so a power cut can be told apart from an update.
CREATE TABLE "BotPresence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "beatAt" DATETIME NOT NULL,
    "cleanExit" BOOLEAN NOT NULL DEFAULT false
);

-- Bits players can claim after Akira was down.
CREATE TABLE "Outage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineAt" DATETIME NOT NULL,
    "onlineAt" DATETIME NOT NULL,
    "bits" INTEGER NOT NULL,
    "claimUntil" DATETIME NOT NULL
);

CREATE INDEX "Outage_claimUntil_idx" ON "Outage"("claimUntil");

CREATE TABLE "OutageClaim" (
    "outageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutageClaim_outageId_fkey" FOREIGN KEY ("outageId") REFERENCES "Outage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutageClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("outageId", "userId")
);
