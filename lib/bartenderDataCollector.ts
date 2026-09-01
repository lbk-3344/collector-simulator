import { resolveGatewayUrl } from "@/lib/bartenderLocations";
import type { DeviceChannel } from "@/lib/deviceConfig";

// Client for Bartender's datacollector-api-v3 — POST /collectors/register,
// DELETE /collectors/{collectorId}, POST /reads, and PUT
// /collectors/{collectorId}/heartbeat. See CLAUDE-CONCEPT.md sections 15.8,
// 7.5 and 15.10, plus the "Phase 0 live verification" notes (2026-08-29,
// verified against the sandbox tenant).
//
// Reuses location-api-v2's two fixed gateway hosts (lib/bartenderLocations.ts),
// just with a /datacollector path suffix; same lowercase `apikey` header.
//
// NOTE: the generic PUT .../heartbeat endpoint (sendHeartbeat, below) is a
// well-specified schema and unrelated to the `heartbeatConfig` object inside
// POST /collectors/register — Phase 0 (BL-053) could not determine that
// object's accepted shape, so it stays omitted from the register payload.

export function resolveDataCollectorGatewayUrl(tenantUrl: string): string {
  return `${resolveGatewayUrl(tenantUrl)}/datacollector`;
}

// The subset of a Device this client needs — kept structural so both the
// create (POST /api/devices) and update (PATCH /api/devices/[id]) routes can
// pass their in-flight `data` object without first round-tripping Prisma.
export interface RegistrableDevice {
  collectorId: string | null;
  name: string;
  type: string;
  locationCode: string;
  model: string | null;
  vendor: string | null;
  configVersion: string | null;
  attributes: Record<string, string | number | boolean> | null;
  channels: DeviceChannel[] | null;
}

// Device -> CollectorRegistration body. Field mapping per section 15.8's
// table. `heartbeatConfig` is intentionally NOT sent — Phase 0 could not
// determine its accepted request shape (10+ variants all rejected with a
// generic type error) and the API YAML isn't in the repo; heartbeat config
// stays local-simulator-only until the schema is provided.
export function buildCollectorRegistrationPayload(device: RegistrableDevice): Record<string, unknown> {
  const channels = (device.channels ?? []).map((ch) => ({
    channelId: ch.id,
    channelType: ch.type,
    ...(ch.type === "PRESENCE"
      ? { presenceEvent: ch.presenceEvent ?? "PRESENT" }
      : { direction: ch.direction ?? "INBOUND" }),
    ...(ch.name ? { attributes: { label: ch.name } } : {}),
  }));

  const payload: Record<string, unknown> = {
    collectorId: device.collectorId,
    collectorName: device.name,
    locationId: device.locationCode,
    readPointType: device.type,
    channels,
  };
  if (device.model) payload.model = device.model;
  if (device.vendor) payload.vendor = device.vendor;
  if (device.configVersion) payload.configVersion = device.configVersion;
  if (device.attributes && Object.keys(device.attributes).length > 0) {
    payload.attributes = device.attributes;
  }
  return payload;
}

// Plain-language error message from datacollector-api-v3's error body
// ({ error: { code, field, message } }), same fallback style as
// app/api/settings/bartender/test/route.ts.
function errorMessageFrom(body: unknown, raw: string, status: number): string {
  const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
  if (err?.message && err.code) return `${err.message} (${err.code})`;
  if (err?.message) return err.message;
  if (raw && raw.length < 200) return raw;
  return `Bartender returned an error (HTTP ${status}).`;
}

export interface RegisterResult {
  ok: boolean;
  status: number;
  reconciliation?: unknown;
  errorMessage?: string;
}

// POST {gateway}/collectors/register. `ok` on any 2xx (201 REGISTERED first
// time, 200 UPDATED on every resync — idempotent on collectorId, replaces the
// whole channel list). Network/DNS failure is a distinct, softer message.
export async function registerCollector(
  tenantUrl: string,
  apiKey: string,
  payload: Record<string, unknown>
): Promise<RegisterResult> {
  const url = `${resolveDataCollectorGatewayUrl(tenantUrl)}/collectors/register`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, errorMessage: "Could not reach the Bartender platform — check the tenant URL." };
  }

  const raw = await res.text().catch(() => "");
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep raw */
  }

  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      reconciliation: (body as { reconciliation?: unknown } | null)?.reconciliation ?? null,
    };
  }
  return { ok: false, status: res.status, errorMessage: errorMessageFrom(body, raw, res.status) };
}

// DELETE {gateway}/collectors/{collectorId}. A 404 COLLECTOR_NOT_FOUND counts
// as success — "already gone" is a fine outcome for a deregister.
export async function deregisterCollector(
  tenantUrl: string,
  apiKey: string,
  collectorId: string
): Promise<{ ok: boolean; errorMessage?: string }> {
  const url = `${resolveDataCollectorGatewayUrl(tenantUrl)}/collectors/${encodeURIComponent(collectorId)}`;

  let res: Response;
  try {
    res = await fetch(url, { method: "DELETE", headers: { apikey: apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, errorMessage: "Could not reach the Bartender platform — check the tenant URL." };
  }

  if (res.ok) return { ok: true };

  const raw = await res.text().catch(() => "");
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep raw */
  }
  if (res.status === 404 || (body as { error?: { code?: string } } | null)?.error?.code === "COLLECTOR_NOT_FOUND") {
    return { ok: true };
  }
  return { ok: false, errorMessage: errorMessageFrom(body, raw, res.status) };
}

// One tag in a POST /reads batch. Exactly one identifier field. Live-probed
// 2026-08-31: a bare 24-char SGTIN-96 hex from the Serialization API works in
// the `hexa` field as-is; a GS1 `urn:epc:id:sgtin:…` works in `epc`. Bare hex
// in `epc`, or `urn:epc:tag:sgtin-96:…`, are rejected (400).
export function tagForItem(item: string): { epc: string } | { hexa: string } | null {
  const s = item.trim();
  if (!s) return null;
  if (s.startsWith("urn:")) return { epc: s };
  if (/^[0-9a-fA-F]{16,}$/.test(s) && s.length % 2 === 0) return { hexa: s.toUpperCase() };
  return { epc: s }; // best effort — some other identifier scheme
}

export interface SendReadsResult {
  ok: boolean;
  status: number;
  readStatus?: "COMMITTED" | "NOTPROCESSED" | string;
  epcisEventId?: string | null;
  submitted: number;
  errorMessage?: string;
}

// POST {gateway}/datacollector/reads — submits one batch of tag observations
// for one Channel in one read cycle (datacollector-api-v3, CLAUDE-CONCEPT.md
// 7.5). 200 = COMMITTED (EPCIS event written) or NOTPROCESSED (channel has no
// active Zone mapping — observations discarded, not an error); 207 = partial.
// Items that don't resolve to a valid tag identifier (e.g. PRESENT-feed
// placeholders) are dropped; an all-dropped batch returns ok:false without a
// network call.
export async function sendReads(
  tenantUrl: string,
  apiKey: string,
  collectorId: string,
  channelId: string,
  items: string[],
  readTime: Date
): Promise<SendReadsResult> {
  const tags = items.map(tagForItem).filter((t): t is { epc: string } | { hexa: string } => t !== null);
  if (tags.length === 0) {
    return { ok: false, status: 0, submitted: 0, errorMessage: "no submittable tag identifiers in this batch" };
  }

  const url = `${resolveDataCollectorGatewayUrl(tenantUrl)}/reads`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ collectorId, channelId, readTime: readTime.toISOString(), tags }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, submitted: tags.length, errorMessage: "Could not reach the Bartender platform." };
  }

  const raw = await res.text().catch(() => "");
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep raw */
  }

  if (res.ok || res.status === 207) {
    const b = body as { status?: string; epcisEventId?: string | null } | null;
    return { ok: true, status: res.status, submitted: tags.length, readStatus: b?.status, epcisEventId: b?.epcisEventId ?? null };
  }
  return { ok: false, status: res.status, submitted: tags.length, errorMessage: errorMessageFrom(body, raw, res.status) };
}

export interface SendHeartbeatResult {
  ok: boolean;
  status: number;
  heartbeatStatus?: "ONLINE" | "CONFIG_PENDING" | string;
  lastSeenAt?: string;
  errorMessage?: string;
}

// PUT {gateway}/collectors/{collectorId}/heartbeat (datacollector-api-v3,
// CLAUDE-CONCEPT.md 15.10).
//
// Live-probed 2026-09-01 against the sandbox: the ONLY accepted body field is
// `timestamp` (ISO 8601). `configVersion` (and every other extra field tried)
// comes back `400 VALIDATION_ERROR "Unknown field."` — the spec's assumed
// `{ timestamp, configVersion? }` was wrong, same category as the
// `heartbeatConfig`-on-register question. Success → `200 { status: "ONLINE",
// lastSeenAt }`. A 404 COLLECTOR_NOT_FOUND means this collectorId was never
// actually registered on the platform (treated as a failure, with the
// platform's own message). `CONFIG_PENDING` is still recognized here
// defensively in case the platform ever returns it (server-side drift
// detection), but this app has no way to elicit it. A scheduled tick
// (lib/deviceHeartbeat.ts) calls this every heartbeatTimeoutSeconds/2 for
// each published, heartbeat-enabled Device.
export async function sendHeartbeat(
  tenantUrl: string,
  apiKey: string,
  collectorId: string
): Promise<SendHeartbeatResult> {
  const url = `${resolveDataCollectorGatewayUrl(tenantUrl)}/collectors/${encodeURIComponent(collectorId)}/heartbeat`;
  const payload: Record<string, unknown> = { timestamp: new Date().toISOString() };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, errorMessage: "Could not reach the Bartender platform." };
  }

  const raw = await res.text().catch(() => "");
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep raw */
  }

  if (res.ok) {
    const b = body as { status?: "ONLINE" | "CONFIG_PENDING" | string; lastSeenAt?: string } | null;
    return { ok: true, status: res.status, heartbeatStatus: b?.status, lastSeenAt: b?.lastSeenAt };
  }
  return { ok: false, status: res.status, errorMessage: errorMessageFrom(body, raw, res.status) };
}
