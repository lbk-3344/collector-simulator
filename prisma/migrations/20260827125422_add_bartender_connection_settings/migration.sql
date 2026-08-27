-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bartenderApiKeyCiphertext" TEXT,
ADD COLUMN     "bartenderApiKeyLast4" TEXT,
ADD COLUMN     "bartenderTenantUrl" TEXT;
