-- BL-067 / CLAUDE-CONCEPT.md section 17 — per-user workspace ownership.
-- Step 1 of 2: add ownerId as NULLABLE + shared, FKs, indexes. The next
-- migration (require_workspace_owner) backfills ownerId and sets NOT NULL.

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "ownerId" TEXT,
ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN "ownerId" TEXT,
ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ItemFeed" ADD COLUMN "ownerId" TEXT,
ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Device_ownerId_idx" ON "Device"("ownerId");

-- CreateIndex
CREATE INDEX "Workflow_ownerId_idx" ON "Workflow"("ownerId");

-- CreateIndex
CREATE INDEX "ItemFeed_ownerId_idx" ON "ItemFeed"("ownerId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemFeed" ADD CONSTRAINT "ItemFeed_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
