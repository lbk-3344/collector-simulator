import { resolveGatewayUrl } from "@/lib/bartenderLocations";
import type { DeviceChannel } from "@/lib/deviceConfig";

// Client for Bartender's datacollector-api-v3 — POST /collectors/register and
// DELETE /collectors/{collectorId}. See CLAUDE-CONCEPT.md section 15.8 and its
// "Phase 0 live verification" notes (2026-08-29, verified against the sandbox
// tenant). Registration only — heartbeat (PUT .../heartbeat) and read
// ingestion (POST /reads) are deliberately not modeled.
//
// Reuses location-api-v2's two fixed gateway hosts (lib/bartenderLocations.ts),
// just with a /datacollector path suffix; same lowercase `apikey` header.

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
