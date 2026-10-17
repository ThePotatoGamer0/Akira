-- Grab lines stay unposted until the dropper takes a card or snipe protection ends.
ALTER TABLE "DropSlot" ADD COLUMN "announced" INTEGER NOT NULL DEFAULT 0;
UPDATE "DropSlot" SET "announced" = 1 WHERE "claimedById" IS NOT NULL;
