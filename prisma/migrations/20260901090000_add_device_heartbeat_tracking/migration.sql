-- BL-072: real DataCollector heartbeat result tracking on Device.
ALTER TABLE "Device"
  ADD COLUMN "lastHeartbeatSentAt" TIMESTAMP(3),
  ADD COLUMN "lastHeartbeatStatus" TEXT,
  ADD COLUMN "lastHeartbeatError" TEXT;
