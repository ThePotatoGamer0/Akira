-- The card a player just grabbed, so a bare view command can open it.
ALTER TABLE "User" ADD COLUMN "lastGrabbedCardId" TEXT;

-- Guilds that also accept Karuta's k and k! prefixes.
ALTER TABLE "GuildConfig" ADD COLUMN "karutaPrefix" INTEGER NOT NULL DEFAULT 0;
