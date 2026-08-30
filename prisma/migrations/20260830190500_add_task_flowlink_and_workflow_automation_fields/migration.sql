-- CreateEnum
CREATE TYPE "TaskInputType" AS ENUM ('ITEM_FEED', 'FLOW_LINK', 'NONE');

-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_workflowId_fkey";

-- AlterTable
ALTER TABLE "Device" DROP COLUMN "workflowId";

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "autoStoppedAt" TIMESTAMP(3),
ADD COLUMN     "maxRunDurationMinutes" INTEGER DEFAULT 240,
ADD COLUMN     "runningStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT,
    "positionX" INTEGER,
    "positionY" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskChannelInput" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "inputType" "TaskInputType" NOT NULL DEFAULT 'NONE',
    "itemFeedId" TEXT,
    "fireIntervalSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskChannelInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowLink" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "sourceTaskId" TEXT NOT NULL,
    "sourceChannelId" TEXT NOT NULL,
    "targetTaskId" TEXT NOT NULL,
    "targetChannelId" TEXT NOT NULL,
    "delayMinSeconds" INTEGER NOT NULL DEFAULT 0,
    "delayMaxSeconds" INTEGER NOT NULL DEFAULT 0,
    "filterGtins" JSONB,
    "filterCategoryCodes" JSONB,
    "isElse" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Task_deviceId_key" ON "Task"("deviceId");

-- CreateIndex
CREATE INDEX "Task_workflowId_idx" ON "Task"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskChannelInput_taskId_channelId_key" ON "TaskChannelInput"("taskId", "channelId");

-- CreateIndex
CREATE INDEX "FlowLink_workflowId_idx" ON "FlowLink"("workflowId");

-- CreateIndex
CREATE INDEX "FlowLink_sourceTaskId_idx" ON "FlowLink"("sourceTaskId");

-- CreateIndex
CREATE INDEX "FlowLink_targetTaskId_idx" ON "FlowLink"("targetTaskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChannelInput" ADD CONSTRAINT "TaskChannelInput_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChannelInput" ADD CONSTRAINT "TaskChannelInput_itemFeedId_fkey" FOREIGN KEY ("itemFeedId") REFERENCES "ItemFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowLink" ADD CONSTRAINT "FlowLink_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowLink" ADD CONSTRAINT "FlowLink_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowLink" ADD CONSTRAINT "FlowLink_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

