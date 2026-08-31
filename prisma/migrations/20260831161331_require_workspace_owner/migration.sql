-- BL-067 / CLAUDE-CONCEPT.md section 17 — per-user workspace ownership.
-- Step 2 of 2: backfill every pre-existing Device/Workflow/ItemFeed row to
-- the seeded bootstrap admin (INITIAL_ADMIN_EMAILS = lbellissard@seagullsoftware.com,
-- confirmed with Luc 2026-08-31, see section 17.5), then enforce NOT NULL.
-- New rows created after step 1 already get ownerId from their POST route.

UPDATE "Device"   SET "ownerId" = u.id FROM "User" u WHERE u.email = 'lbellissard@seagullsoftware.com' AND "Device"."ownerId" IS NULL;
UPDATE "Workflow" SET "ownerId" = u.id FROM "User" u WHERE u.email = 'lbellissard@seagullsoftware.com' AND "Workflow"."ownerId" IS NULL;
UPDATE "ItemFeed" SET "ownerId" = u.id FROM "User" u WHERE u.email = 'lbellissard@seagullsoftware.com' AND "ItemFeed"."ownerId" IS NULL;

ALTER TABLE "Device"   ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Workflow" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "ItemFeed" ALTER COLUMN "ownerId" SET NOT NULL;
