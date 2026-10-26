-- Latin-Japanese (romaji) or English series names in the WebUI.
ALTER TABLE "User" ADD COLUMN "seriesTitle" TEXT NOT NULL DEFAULT 'romaji';
