/*
  Warnings:

  - You are about to drop the column `status` on the `Device` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[collectorId]` on the table `Device` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('RUNNING', 'STOPPED');

-- AlterTable
ALTER TABLE "Device" DROP COLUMN "status",
ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "channelAttributes" JSONB,
ADD COLUMN     "channelDirection" TEXT,
ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "channelPresenceEvent" TEXT DEFAULT 'PRESENT',
ADD COLUMN     "channelType" TEXT DEFAULT 'PRESENCE',
ADD COLUMN     "collectorId" TEXT,
ADD COLUMN     "configVersion" TEXT,
ADD COLUMN     "configured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "heartbeatEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "heartbeatTimeoutSeconds" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "vendor" TEXT,
ADD COLUMN     "workflowId" TEXT;

-- DropEnum
DROP TYPE "DeviceStatus";

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_collectorId_key" ON "Device"("collectorId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
