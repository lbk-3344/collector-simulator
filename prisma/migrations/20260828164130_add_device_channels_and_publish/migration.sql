/*
  Warnings:

  - You are about to drop the column `channelAttributes` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `channelDirection` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `channelId` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `channelPresenceEvent` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `channelType` on the `Device` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Device" DROP COLUMN "channelAttributes",
DROP COLUMN "channelDirection",
DROP COLUMN "channelId",
DROP COLUMN "channelPresenceEvent",
DROP COLUMN "channelType",
ADD COLUMN     "channels" JSONB,
ADD COLUMN     "publishedAt" TIMESTAMP(3);
