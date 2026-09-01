-- BL-073: optional per-feed GS1 EPC encoding for NEW Item Feeds.
ALTER TABLE "ItemFeed" ADD COLUMN "gs1Standard" TEXT;
