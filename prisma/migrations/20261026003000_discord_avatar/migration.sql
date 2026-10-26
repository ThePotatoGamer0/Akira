-- Cached Discord avatar hash for WebUI faces. Empty string means Discord has no custom avatar.
ALTER TABLE "User" ADD COLUMN "discordAvatar" TEXT;
