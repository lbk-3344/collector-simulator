import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

// Client for Bartender's location-api-v2 — see CLAUDE-CONCEPT.md section 7.3.
// Corrected 2026-08-27 (Luc): the second gateway is "sandbox", not "staging" —
// live-tested successfully against api.sandbox.bartender-tt.com using the
// lowercase `apikey` header (not `X-API-Key` as originally spec'd). The map
// endpoint returns 403 for this key's permission scope — a real, distinct
// outcome from the 404 "no map for this location type" case — so callers
// must still degrade gracefully rather than assume every call succeeds.

const PRODUCTION_GATEWAY = "https://api.bartender-tt.com";
const SANDBOX_GATEWAY = "https://api.sandbox.bartender-tt.com";

// Pure — kept isolated from call sites since the substring match is the
// single place that decides which gateway a tenant routes through.
export function resolveGatewayUrl(tenantUrl: string): string {
  return tenantUrl.includes("sandbox") ? SANDBOX_GATEWAY : PRODUCTION_GATEWAY;
}

export interface BartenderLocation {
  code: string;
  name: string;
  type: "DC" | "FACTORY" | "STORE" | "SUPPLIER" | "CUSTOMER";
  address?: string | null;
  zipcode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  hasMap: boolean;
  zoneCount: number;
}

export interface LocationMap {
  mapUrl: string;
  width: number;
  height: number;
}

export interface LocationZone {
  code?: string;
  name?: string;
  type?: string;
  position: { x: number; y: number };
}

// Raw shape of a zone entry as returned by GET /locations/{code}/zones —
// zoneCode/zoneName identify the zone itself; code/name (unused here) are
// the parent location's, repeated on every entry.
interface RawZone {
  zoneCode?: string;
  zoneName?: string;
  type?: string | null;
  position: { x: number; y: number };
}

export type GatewayResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

// Same two error modes as section 7.2's client (app/api/settings/bartender/test/route.ts):
// HTTP error status vs. network/DNS failure. Response shape here is unconfirmed,
// so parse defensively — try JSON, fall back to raw text — rather than assuming one format.
async function callGateway<T>(tenantUrl: string, apiKey: string, path: string): Promise<GatewayResult<T>> {
  const url = `${resolveGatewayUrl(tenantUrl)}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { apikey: apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, error: "Could not reach the location-api-v2 gateway." };
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      message = typeof parsed?.message === "string" ? parsed.message : raw;
    } catch {
      // Not JSON — keep the raw text as the message.
    }
    return { ok: false, error: message || `Gateway returned HTTP ${response.status}.`, status: response.status };
  }

  const data = await response.json().catch(() => null);
  if (data === null) return { ok: false, error: "Unexpected response from the gateway." };
  return { ok: true, data: data as T };
}

export async function getUserBartenderCredentials(
  userId: string
): Promise<{ tenantUrl: string; apiKey: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bartenderTenantUrl: true, bartenderApiKeyCiphertext: true },
  });
  if (!user?.bartenderTenantUrl || !user.bartenderApiKeyCiphertext) return null;
  const apiKey = decrypt(user.bartenderApiKeyCiphertext);
  return { tenantUrl: user.bartenderTenantUrl, apiKey };
}

// GET /locations returns a paginated envelope ({ page, total, pageSize,
// locations: [...] }), not a bare array — unwrap it here so callers just get
// the list.
export async function listLocations(tenantUrl: string, apiKey: string): Promise<GatewayResult<BartenderLocation[]>> {
  const result = await callGateway<{ locations: BartenderLocation[] }>(tenantUrl, apiKey, "/locations");
  if (!result.ok) return result;
  return { ok: true, data: result.data.locations };
}

// A location with no floor plan is a normal, expected outcome (SUPPLIER/CUSTOMER
// type locations "may not have a map or zones" per the spec) — a 404 here is
// treated as { ok: true, data: null }, not an error.
export async function getLocationMap(
  tenantUrl: string,
  apiKey: string,
  code: string
): Promise<GatewayResult<LocationMap | null>> {
  const url = `${resolveGatewayUrl(tenantUrl)}/locations/${encodeURIComponent(code)}/map`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { apikey: apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, error: "Could not reach the location-api-v2 gateway." };
  }

  if (response.status === 404) return { ok: true, data: null };

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      message = typeof parsed?.message === "string" ? parsed.message : raw;
    } catch {
      // Not JSON — keep the raw text.
    }
    return { ok: false, error: message || `Gateway returned HTTP ${response.status}.`, status: response.status };
  }

  const data = await response.json().catch(() => null);
  return { ok: true, data: data as LocationMap };
}

// GET /locations/{code}/zones returns { locationCode, zones: [...] }, with
// each zone's own identity under zoneCode/zoneName (code/name on the entry
// are the parent location's, not the zone's) — normalize to LocationZone.
export async function getLocationZones(
  tenantUrl: string,
  apiKey: string,
  code: string
): Promise<GatewayResult<LocationZone[]>> {
  const result = await callGateway<{ zones: RawZone[] }>(tenantUrl, apiKey, `/locations/${encodeURIComponent(code)}/zones`);
  if (!result.ok) return result;
  return {
    ok: true,
    data: result.data.zones.map((z) => ({
      code: z.zoneCode,
      name: z.zoneName,
      type: z.type ?? undefined,
      position: z.position,
    })),
  };
}
