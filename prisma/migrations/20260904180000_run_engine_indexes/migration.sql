-- DropIndex
DROP INDEX "FlowLink_sourceTaskId_idx";

-- CreateIndex
CREATE INDEX "FlowLink_sourceTaskId_sourceChannelId_idx" ON "FlowLink"("sourceTaskId", "sourceChannelId");

-- CreateIndex
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");

