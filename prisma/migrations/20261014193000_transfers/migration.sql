-- An open give or trade. Both players have to accept before the cards move.
CREATE TABLE "TransferOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "fromCardId" TEXT NOT NULL,
    "toCardId" TEXT,
    "fromConfirmed" INTEGER NOT NULL DEFAULT 0,
    "toConfirmed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransferOffer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransferOffer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TransferOffer_status_fromCardId_idx" ON "TransferOffer"("status", "fromCardId");
CREATE INDEX "TransferOffer_status_toCardId_idx" ON "TransferOffer"("status", "toCardId");
