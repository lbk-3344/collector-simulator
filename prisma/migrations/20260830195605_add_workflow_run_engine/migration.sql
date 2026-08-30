-- AlterTable
ALTER TABLE "TaskChannelInput" ADD COLUMN     "lastFiredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InFlightBatch" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "gtin" TEXT,
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InFlightBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatedRead" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "gtin" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulatedRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InFlightBatch_workflowId_idx" ON "InFlightBatch"("workflowId");

-- CreateIndex
CREATE INDEX "InFlightBatch_processedAt_arrivesAt_idx" ON "InFlightBatch"("processedAt", "arrivesAt");

-- CreateIndex
CREATE INDEX "SimulatedRead_workflowId_occurredAt_idx" ON "SimulatedRead"("workflowId", "occurredAt");

-- AddForeignKey
ALTER TABLE "InFlightBatch" ADD CONSTRAINT "InFlightBatch_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulatedRead" ADD CONSTRAINT "SimulatedRead_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
