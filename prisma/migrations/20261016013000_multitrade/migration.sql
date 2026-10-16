-- Several cards and bits, offered in one channel, then locked by both players.
CREATE TABLE "Multitrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'request',
    "fromLocked" INTEGER NOT NULL DEFAULT 0,
    "toLocked" INTEGER NOT NULL DEFAULT 0,
    "closeReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Multitrade_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Multitrade_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Multitrade_status_channelId_idx" ON "Multitrade"("status", "channelId");
CREATE INDEX "Multitrade_fromUserId_status_idx" ON "Multitrade"("fromUserId", "status");
CREATE INDEX "Multitrade_toUserId_status_idx" ON "Multitrade"("toUserId", "status");

CREATE TABLE "MultitradeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT,
    "bits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MultitradeEntry_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Multitrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MultitradeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MultitradeEntry_tradeId_userId_idx" ON "MultitradeEntry"("tradeId", "userId");
CREATE INDEX "MultitradeEntry_cardId_idx" ON "MultitradeEntry"("cardId");
