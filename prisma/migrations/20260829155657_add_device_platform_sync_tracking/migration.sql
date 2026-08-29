-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "platformReconciliation" JSONB;
