-- A player's own fallback frame. Null keeps the server default.
ALTER TABLE "User" ADD COLUMN "defaultFrameId" INTEGER;
