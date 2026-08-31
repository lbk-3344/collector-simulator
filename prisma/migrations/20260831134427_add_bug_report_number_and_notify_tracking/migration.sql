-- AlterTable
ALTER TABLE "BugReport" ADD COLUMN     "notifiedResolvedAt" TIMESTAMP(3),
ADD COLUMN     "notifiedStartAt" TIMESTAMP(3),
ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BugReport_number_key" ON "BugReport"("number");

