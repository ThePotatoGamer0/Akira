-- Remember when the drop message has been edited to say it expired.
ALTER TABLE "Drop" ADD COLUMN "expiryPosted" INTEGER NOT NULL DEFAULT 0;
