-- Points a finished trade was worth, frozen so the pair's daily budget does not drift with supply.
ALTER TABLE "Multitrade" ADD COLUMN "value" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TransferOffer" ADD COLUMN "value" INTEGER NOT NULL DEFAULT 0;

-- When Akira first saw a player. Existing rows start the catch-up clock from the upgrade,
-- which is the safe direction: nobody loses a bonus they already had.
ALTER TABLE "User" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Multitrade entries name their card so a trade can be priced without a second lookup.
-- The relation is written as column plus foreign key by hand; SQLite wants the table rebuilt.
-- The old entries card index carries over as the relation's index; a second one would be a duplicate.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MultitradeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT,
    "bits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MultitradeEntry_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Multitrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MultitradeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MultitradeEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MultitradeEntry" ("bits", "cardId", "createdAt", "id", "tradeId", "userId") SELECT "bits", "cardId", "createdAt", "id", "tradeId", "userId" FROM "MultitradeEntry";
DROP TABLE "MultitradeEntry";
ALTER TABLE "new_MultitradeEntry" RENAME TO "MultitradeEntry";
CREATE INDEX "MultitradeEntry_tradeId_userId_idx" ON "MultitradeEntry"("tradeId", "userId");
CREATE INDEX "MultitradeEntry_cardId_idx" ON "MultitradeEntry"("cardId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
