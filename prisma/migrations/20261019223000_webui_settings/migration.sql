-- How the WebUI collection opens, and whether it pages.
ALTER TABLE "User" ADD COLUMN "collectionOrder" TEXT NOT NULL DEFAULT 'character';
ALTER TABLE "User" ADD COLUMN "continuousScroll" INTEGER NOT NULL DEFAULT 0;
