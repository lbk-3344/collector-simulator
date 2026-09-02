-- BL-074: manual OFFLINE device state.
-- Null = not manually offline. Ignored while the Device is Active (a
-- running Workflow always wins); not cleared when a Workflow start
-- overrides it, so it is restored once that Workflow stops.
ALTER TABLE "Device" ADD COLUMN "offlineAt" TIMESTAMP(3);
