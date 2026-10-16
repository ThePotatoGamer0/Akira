-- Bot DMs that should be deleted after a while.
CREATE TABLE "EphemeralMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);
