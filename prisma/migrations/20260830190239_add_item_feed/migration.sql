-- CreateEnum
CREATE TYPE "ItemFeedKind" AS ENUM ('NEW', 'PRESENT', 'FIXED');

-- CreateTable
CREATE TABLE "ItemFeed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ItemFeedKind" NOT NULL,
    "gtin" TEXT,
    "categoryCode" TEXT,
    "quantityMin" INTEGER,
    "quantityMax" INTEGER,
    "locationCode" TEXT,
    "zoneCode" TEXT,
    "fixedItems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemFeed_pkey" PRIMARY KEY ("id")
);
