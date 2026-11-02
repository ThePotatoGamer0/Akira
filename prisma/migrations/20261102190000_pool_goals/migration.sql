-- What last midnight left in the pot, shown next to the live total. Existing pools carry nothing yet.
ALTER TABLE "ServerPool" ADD COLUMN "carriedBits" INTEGER NOT NULL DEFAULT 0;

-- Today's buff poll, plus the day it was posted so a crossed pot cannot open two.
ALTER TABLE "ServerPool" ADD COLUMN "pollMessage" TEXT;
ALTER TABLE "ServerPool" ADD COLUMN "pollDay" TEXT;

-- Where the pool's buff poll goes. Separate from the drop channel, so a frozen poll is not lost in drops.
ALTER TABLE "GuildConfig" ADD COLUMN "poolChannelId" TEXT;
