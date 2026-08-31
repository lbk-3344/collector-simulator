-- CreateEnum
CREATE TYPE "PresentMatchMode" AS ENUM ('GTIN_LIST', 'ALL');

-- DropForeignKey
ALTER TABLE "TaskChannelInput" DROP CONSTRAINT "TaskChannelInput_itemFeedId_fkey";

-- DropForeignKey
ALTER TABLE "TaskChannelInput" DROP CONSTRAINT "TaskChannelInput_taskId_fkey";

-- AlterTable
ALTER TABLE "ItemFeed" DROP COLUMN "gtin",
ADD COLUMN     "gtins" JSONB,
ADD COLUMN     "presentMatchMode" "PresentMatchMode";

-- DropTable
DROP TABLE "TaskChannelInput";

-- DropEnum
DROP TYPE "TaskInputType";

-- CreateTable
CREATE TABLE "FeedNode" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "itemFeedId" TEXT NOT NULL,
    "positionX" INTEGER,
    "positionY" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedLink" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "feedNodeId" TEXT NOT NULL,
    "targetTaskId" TEXT NOT NULL,
    "targetChannelId" TEXT NOT NULL,
    "fireIntervalSeconds" INTEGER NOT NULL,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedNode_workflowId_idx" ON "FeedNode"("workflowId");

-- CreateIndex
CREATE INDEX "FeedLink_workflowId_idx" ON "FeedLink"("workflowId");

-- CreateIndex
CREATE INDEX "FeedLink_targetTaskId_idx" ON "FeedLink"("targetTaskId");

-- AddForeignKey
ALTER TABLE "FeedNode" ADD CONSTRAINT "FeedNode_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNode" ADD CONSTRAINT "FeedNode_itemFeedId_fkey" FOREIGN KEY ("itemFeedId") REFERENCES "ItemFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedLink" ADD CONSTRAINT "FeedLink_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedLink" ADD CONSTRAINT "FeedLink_feedNodeId_fkey" FOREIGN KEY ("feedNodeId") REFERENCES "FeedNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedLink" ADD CONSTRAINT "FeedLink_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

