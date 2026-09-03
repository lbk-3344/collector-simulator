-- PRESENT ("In stock") feeds: add a "take the whole zone stock each firing"
-- flag. Default true (Luc: "most of the time we want the full stock"), which
-- also backfills every existing PRESENT feed to take-all. quantityMin is no
-- longer used for PRESENT; quantityMax stays as the cap for presentTakeAll=false.
ALTER TABLE "ItemFeed" ADD COLUMN "presentTakeAll" BOOLEAN NOT NULL DEFAULT true;
