export interface WorkflowRecord {
  id: string;
  name: string;
  status: "RUNNING" | "STOPPED";
}

// One Channel entry on a Device — repeatable list, see CLAUDE-CONCEPT.md
// section 15.1 (BL-049). `id` is a per-Device sequence ("CH1", "CH2", …),
// not derived from collectorId, and not user-edited — same id/name split as
// Device's own collectorId/name. `name` (BL-049a) is an optional freeform
// label, e.g. "Entry sensor". Only `presenceEvent` or `direction` applies
// depending on `type`, never both.
export interface DeviceChannel {
  id: string;
  name?: string;
  type: "PRESENCE" | "DIRECTIONAL";
  presenceEvent?: "FIRST_SEEN" | "PRESENT" | "LAST_SEEN";
  direction?: "INBOUND" | "OUTBOUND";
}

// Shape returned by every /api/devices* route (GET/POST/PATCH all include
// the same `workflow` relation) — the one canonical Device type shared by
// the Overview map, the config modal, and the Devices list (BL-042 to BL-047).
export interface DeviceRecord {
  id: string;
  // Per-user workspace ownership (BL-067). `shared` = visible read-only to
  // non-owners; client compares `ownerId` against the session user id that
  // each list route returns alongside its rows.
  ownerId: string;
  shared: boolean;
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
  // Manual OFFLINE toggle (BL-074) — null unless the owner turned it off.
  offlineAt: string | null;
  // Platform sync-health (BL-053, CLAUDE-CONCEPT.md section 15.8).
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  platformReconciliation: PlatformReconciliation | null;
  // Real heartbeat health (BL-072, CLAUDE-CONCEPT.md section 15.10).
  lastHeartbeatSentAt: string | null;
  lastHeartbeatStatus: string | null;
  lastHeartbeatError: string | null;
  // The Device's Tasks (BL-059) — its links to Workflows. A Device can be a
  // Task in several Workflows at once (2026-09-04); empty when it's on no
  // canvas.
  tasks: { id: string; name: string | null; workflow: WorkflowRecord | null }[];
}

// Shape of the `reconciliation` block on a POST /collectors/register response,
// as observed live in Phase 0 (2026-08-29) — the spec's assumed shape was
// wrong. `mappingStatus` is the coarse flag the UI acts on (CONFLICT / BROKEN
// surface per-Channel; OFFLINE is expected and ignored since this app never
// sends heartbeats); `issue`/`detail` are a finer code + human text.
export interface ReconciliationMapping {
  channelId: string;
  zoneId: string | null;
  zoneName: string | null;
  issue: string;
  detail: string;
  mappingStatus: "OFFLINE" | "CONFLICT" | "BROKEN" | string;
}
export interface PlatformReconciliation {
  affectedMappings?: ReconciliationMapping[];
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

// configVersion version management (BL-053, CLAUDE-CONCEPT.md section 15.8).
// Only bumps on a save that will sync to the platform, and only when the user
// left the field untouched *and* the stored value is purely numeric — a
// hand-typed value (numeric or not) always wins as-is, no auto-increment on
// top of it. `willSync` is Publish, or any Save on an already-published Device.
export function resolveConfigVersion(
  existing: string | null,
  submitted: string | null | undefined,
  willSync: boolean
): string | null {
  const sub = typeof submitted === "string" && submitted.trim() ? submitted.trim() : null;
  if (!willSync) return sub;
  const unchanged = (sub ?? "") === (existing ?? "");
  if (unchanged && existing && /^\d+$/.test(existing)) {
    return String(parseInt(existing, 10) + 1);
  }
  return sub;
}

// Shared "full config save" data-shaping for Device create/update — used by
// both POST /api/devices (Devices-list "+ Add device", BL-047) and
// PATCH /api/devices/[id] (config screen save, BL-045). Sets configured:
// true unconditionally. Since BL-053 (section 15.8) it no longer sets
// publishedAt — that's set only once a real POST /collectors/register
// succeeds, handled by lib/deviceSync.ts.
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
    configured: true,
    ...(typeof body.positionX === "number" ? { positionX: body.positionX } : {}),
    ...(typeof body.positionY === "number" ? { positionY: body.positionY } : {}),
  };
}
