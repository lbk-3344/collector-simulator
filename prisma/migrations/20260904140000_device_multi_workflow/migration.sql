-- A Device can now be a Task in several Workflows at once (Luc, 2026-09-04 —
-- revises §16.2/§16.8). Drop the global unique on Task.deviceId; keep it
-- unique per Workflow instead.
-- DropIndex
DROP INDEX "Task_deviceId_key";

-- CreateIndex
CREATE INDEX "Task_deviceId_idx" ON "Task"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_workflowId_deviceId_key" ON "Task"("workflowId", "deviceId");

-- Task.name was silently populated with a snapshot of the Device's name at
-- creation time, which is what made a later Device rename not show up on the
-- canvas. There is no task-rename UI, so every existing value is just that
-- stale copy — clear them so the canvas falls back to the live Device name.
UPDATE "Task" SET "name" = NULL;
