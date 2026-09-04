-- CreateTable
CREATE TABLE "HiddenDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenWorkflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenItemFeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemFeedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenItemFeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiddenDevice_deviceId_idx" ON "HiddenDevice"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenDevice_userId_deviceId_key" ON "HiddenDevice"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "HiddenWorkflow_workflowId_idx" ON "HiddenWorkflow"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenWorkflow_userId_workflowId_key" ON "HiddenWorkflow"("userId", "workflowId");

-- CreateIndex
CREATE INDEX "HiddenItemFeed_itemFeedId_idx" ON "HiddenItemFeed"("itemFeedId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenItemFeed_userId_itemFeedId_key" ON "HiddenItemFeed"("userId", "itemFeedId");

-- AddForeignKey
ALTER TABLE "HiddenDevice" ADD CONSTRAINT "HiddenDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenDevice" ADD CONSTRAINT "HiddenDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenWorkflow" ADD CONSTRAINT "HiddenWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenWorkflow" ADD CONSTRAINT "HiddenWorkflow_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenItemFeed" ADD CONSTRAINT "HiddenItemFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenItemFeed" ADD CONSTRAINT "HiddenItemFeed_itemFeedId_fkey" FOREIGN KEY ("itemFeedId") REFERENCES "ItemFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

