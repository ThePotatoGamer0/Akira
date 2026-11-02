-- The collection opens on Auto, which hands a search to the ranker. Players who
-- never chose an order were on the default, so they move over too.
ALTER TABLE "User" ALTER COLUMN "collectionOrder" SET DEFAULT 'auto';
UPDATE "User" SET "collectionOrder" = 'auto' WHERE "collectionOrder" = 'character';
