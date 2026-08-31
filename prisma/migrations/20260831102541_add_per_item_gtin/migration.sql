-- AlterTable
ALTER TABLE "InFlightBatch" ADD COLUMN     "itemGtins" JSONB;

-- AlterTable
ALTER TABLE "SimulatedRead" ADD COLUMN     "itemGtins" JSONB;
