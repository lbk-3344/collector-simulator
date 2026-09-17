-- AlterTable
ALTER TABLE "ItemFeed" ADD COLUMN     "assetType" TEXT,
ADD COLUMN     "companyPrefix" TEXT,
ADD COLUMN     "extensionDigit" TEXT,
ADD COLUMN     "generalManagerNumber" TEXT,
ADD COLUMN     "gs1DateField" TEXT,
ADD COLUMN     "gs1DigitalLinkBaseUrl" TEXT,
ADD COLUMN     "gs1Filter" INTEGER,
ADD COLUMN     "gs1LotCode" TEXT,
ADD COLUMN     "gs1LotMode" TEXT,
ADD COLUMN     "gs1ShelfLifeDays" INTEGER,
ADD COLUMN     "itemReference" TEXT,
ADD COLUMN     "objectClass" TEXT;
