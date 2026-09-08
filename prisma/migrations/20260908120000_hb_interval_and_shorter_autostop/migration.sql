-- 2026-09-08 (Luc), part of pulling the Neon compute burn down after the
-- free-tier quota outage: heartbeats every 10 min (was every 60s — the
-- deviceHeartbeat tick now uses heartbeatTimeoutSeconds as the send interval
-- directly, no more /2), and workflows auto-stop after 1h (was 4h) so a
-- forgotten run doesn't keep the compute awake all day.

-- AlterTable
ALTER TABLE "Device" ALTER COLUMN "heartbeatTimeoutSeconds" SET DEFAULT 600;

-- AlterTable
ALTER TABLE "Workflow" ALTER COLUMN "maxRunDurationMinutes" SET DEFAULT 60;

-- Backfill every existing row to the new values (there is no per-row UI for
-- either field yet, so every value is the old default).
UPDATE "Device" SET "heartbeatTimeoutSeconds" = 600;
UPDATE "Workflow" SET "maxRunDurationMinutes" = 60;
