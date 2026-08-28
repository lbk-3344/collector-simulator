export interface WorkflowRecord {
  id: string;
  name: string;
  status: "RUNNING" | "STOPPED";
}

// One Channel entry on a Device — repeatable list, see CLAUDE-CONCEPT.md
// section 15.1 (BL-049). `id` is a per-Device sequence ("CH1", "CH2", …),
// not derived from collectorId. Only `presenceEvent` or `direction` applies
// depending on `type`, never both.
export interface DeviceChannel {
  id: string;
  type: "PRESENCE" | "DIRECTIONAL";
  presenceEvent?: "FIRST_SEEN" | "PRESENT" | "LAST_SEEN";
  direction?: "INBOUND" | "OUTBOUND";
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
  channels: DeviceChannel[] | null;
  configured: boolean;
  publishedAt: string | null;
  workflowId: string | null;
  workflow: WorkflowRecord | null;
}

const DEFAULT_CHANNELS: DeviceChannel[] = [{ id: "CH1", type: "PRESENCE", presenceEvent: "PRESENT" }];

// Minimal shape validation for a present-but-possibly-malformed `channels`
// array, mirroring the existing name/locationCode required-field pattern in
// the routes — an *absent* `channels` is fine (buildDeviceConfigData
// defaults it), but a present, empty, or malformed one is rejected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateChannels(body: any): string | null {
  if (body.channels === undefined) return null;
  if (!Array.isArray(body.channels) || body.channels.length === 0) {
    return "channels must be a non-empty array";
  }
  for (const ch of body.channels) {
    if (!ch || typeof ch.id !== "string" || !ch.id) {
      return "each channel requires an id";
    }
    if (ch.type !== "PRESENCE" && ch.type !== "DIRECTIONAL") {
      return "each channel requires a valid type";
    }
  }
  return null;
}

// Shared "full config save" data-shaping for Device create/update — used by
// both POST /api/devices (Devices-list "+ Add device", BL-047) and
// PATCH /api/devices/[id] (config screen save, BL-045). Sets configured:
// true unconditionally; publishedAt is only ever set (never cleared) here,
// and only when body.publish === true — see CLAUDE-CONCEPT.md section
// 15.1/15.3/15.4 (BL-049/050/051).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDeviceConfigData(body: any) {
  const collectorId = typeof body.collectorId === "string" && body.collectorId.trim() ? body.collectorId.trim() : null;
  const channels =
    Array.isArray(body.channels) && body.channels.length > 0
      ? body.channels
      : DEFAULT_CHANNELS;
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
    channels,
    workflowId: typeof body.workflowId === "string" && body.workflowId ? body.workflowId : null,
    configured: true,
    ...(body.publish === true ? { publishedAt: new Date() } : {}),
    ...(typeof body.positionX === "number" ? { positionX: body.positionX } : {}),
    ...(typeof body.positionY === "number" ? { positionY: body.positionY } : {}),
  };
}
