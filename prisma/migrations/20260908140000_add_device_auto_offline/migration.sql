-- BL-086 (2026-09-08). Per-site device power control + auto-offline after an
-- hour, so an unused simulator stops sending heartbeats and lets the Neon
-- compute idle.
-- AlterTable
ALTER TABLE "Device" ADD COLUMN "autoOfflineAt" TIMESTAMP(3);

-- Devices are now Offline by default (published no longer implies Online).
-- Everything currently Online is flipped Offline; the map's power panel
-- turns a site's devices back on for a 1h window when someone uses it.
UPDATE "Device" SET "offlineAt" = now() WHERE "offlineAt" IS NULL;
