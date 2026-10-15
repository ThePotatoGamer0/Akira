-- Series a player pinned on the stats completion card. At most four, ordered by position.
CREATE TABLE "TrackedSeries" (
    "userId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    PRIMARY KEY ("userId", "seriesId"),
    CONSTRAINT "TrackedSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrackedSeries_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TrackedSeries_userId_position_key" ON "TrackedSeries"("userId", "position");
