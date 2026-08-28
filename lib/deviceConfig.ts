export interface WorkflowRecord {
  id: string;
  name: string;
  status: "RUNNING" | "STOPPED";
}

// Shape returned by every /api/devices* route (GET/POST/PATCH all include
// the same `workflow` relation) — the one canonical Device type shared by
// the Overview map, the config modal, and the Devices list (BL-042 to BL-047).
export interface DeviceRecord {
  id: string;
  collectorId: string | null;
  name: string;
  type: string;
  locationCode: string;
  positionX: number | null;
  positionY: number | null;
  model: string | null;
  vendor: string | null;
  configVersion: string | null;
  heartbeatEnabled: boolean;
  heartbeatTimeoutSeconds: number;
  attributes: Record<string, string | number | boolean> | null;
  configured: boolean;
  workflowId: string | null;
  workflow: WorkflowRecord | null;
}

// Shared "full config save" data-shaping for Device create/update — used by
// both POST /api/devices (Devices-list "+ Add device", BL-047) and
// PATCH /api/devices/[id] (config screen save, BL-045). Sets configured:
// true and auto-populates the single default Channel from collectorId — see
// CLAUDE-CONCEPT.md section 15.1/15.4's explicit single-Channel scope decision.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeviceConfigData(body: any) {
  const collectorId = typeof body.collectorId === "string" && body.collectorId.trim() ? body.collectorId.trim() : null;
  return {
    name: body.name,
    type: body.type,
    locationCode: body.locationCode,
    collectorId,
    model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : null,
    vendor: typeof body.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null,
    configVersion: typeof body.configVersion === "string" && body.configVersion.trim() ? body.configVersion.trim() : null,
    heartbeatEnabled: typeof body.heartbeatEnabled === "boolean" ? body.heartbeatEnabled : true,
    heartbeatTimeoutSeconds: typeof body.heartbeatTimeoutSeconds === "number" ? body.heartbeatTimeoutSeconds : 120,
    attributes: body.attributes ?? null,
    workflowId: typeof body.workflowId === "string" && body.workflowId ? body.workflowId : null,
    configured: true,
    channelId: collectorId ? `${collectorId}-ch1` : null,
    channelType: "PRESENCE",
    channelPresenceEvent: "PRESENT",
    ...(typeof body.positionX === "number" ? { positionX: body.positionX } : {}),
    ...(typeof body.positionY === "number" ? { positionY: body.positionY } : {}),
  };
}
