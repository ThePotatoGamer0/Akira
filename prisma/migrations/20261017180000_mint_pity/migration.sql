-- Drops in a row with no mint. The 200th forces one card to mint.
ALTER TABLE "User" ADD COLUMN "dropsSinceMint" INTEGER NOT NULL DEFAULT 0;
