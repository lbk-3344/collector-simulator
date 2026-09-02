import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { loggedFetch } from "@/lib/apiCallLog";

// Human-readable label for a location-api-v2 call, keyed off the path
// (BL-076). Sources: "List Locations" / "List Zones" are the spec's own
// `listLocations` / `listZones` summaries; "Get a Location Floor Plan" is
// inferred from sibling operations, NOT verbatim-confirmed.
function locationApiLabel(path: string): string {
  if (path.endsWith("/zones")) return "List Zones";
  if (path.endsWith("/map")) return "Get a Location Floor Plan";
  return "List Locations";
}

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
  // Optional: the legacy-map-image fallback (section 7.4) doesn't know the
  // image's pixel dimensions ahead of time — omitted rather than guessed, so
  // callers fall back to the <img>'s own natural size.
  width?: number;
  height?: number;
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
async function callGateway<T>(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  path: string
): Promise<GatewayResult<T>> {
  const url = `${resolveGatewayUrl(tenantUrl)}${path}`;

  let response: Response;
  try {
    response = await loggedFetch(userId, locationApiLabel(path), url, {
      headers: { apikey: apiKey },
      cache: "no-store",
    });
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

export type RunCredentials = { tenantUrl: string; apiKey: string };

// Per-owner credentials for the unattended cron ticks — the run engine
// (BL-061) and the heartbeat tick (BL-072). There's no session to read a
// user from, and the app is multi-tenant: each RUNNING Workflow / published
// Device belongs to a user with their *own* Bartender tenant + API key, and
// its reads / heartbeats must go there. **Revised 2026-09-02** — previously a
// single global `getServiceCredentials()` (the oldest connected user) drove
// every tick, so any resource owned by someone on a different tenant got
// COLLECTOR_NOT_FOUND on heartbeat and empty batches from the run engine
// (mint / stock hit the wrong tenant). Now each tick builds one of these
// caches and resolves credentials per resource owner; the returned function
// looks up any given owner at most once per tick.
export function makeOwnerCredentialsCache(): (ownerId: string) => Promise<RunCredentials | null> {
  const cache = new Map<string, RunCredentials | null>();
  return async (ownerId: string) => {
    if (!cache.has(ownerId)) {
      cache.set(ownerId, await getUserBartenderCredentials(ownerId));
    }
    return cache.get(ownerId) ?? null;
  };
}

// Basic Auth credentials for the legacy map workaround (section 7.4,
// BL-040/041) — a separate, optional credential pair from the API key above.
export async function getUserBartenderBasicAuthCredentials(
  userId: string
): Promise<{ username: string; password: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bartenderUsername: true, bartenderPasswordCiphertext: true },
  });
  if (!user?.bartenderUsername || !user.bartenderPasswordCiphertext) return null;
  const password = decrypt(user.bartenderPasswordCiphertext);
  return { username: user.bartenderUsername, password };
}

// GET /locations returns a paginated envelope ({ page, total, pageSize,
// locations: [...] }), not a bare array — unwrap it here so callers just get
// the list.
export async function listLocations(
  userId: string,
  tenantUrl: string,
  apiKey: string
): Promise<GatewayResult<BartenderLocation[]>> {
  const result = await callGateway<{ locations: BartenderLocation[] }>(userId, tenantUrl, apiKey, "/locations");
  if (!result.ok) return result;
  return { ok: true, data: result.data.locations };
}

// A location with no floor plan is a normal, expected outcome (SUPPLIER/CUSTOMER
// type locations "may not have a map or zones" per the spec) — a 404 here is
// treated as { ok: true, data: null }, not an error.
export async function getLocationMap(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  code: string
): Promise<GatewayResult<LocationMap | null>> {
  const url = `${resolveGatewayUrl(tenantUrl)}/locations/${encodeURIComponent(code)}/map`;

  let response: Response;
  try {
    response = await loggedFetch(userId, "Get a Location Floor Plan", url, {
      headers: { apikey: apiKey },
      cache: "no-store",
    });
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
// Legacy floor-plan map workaround — see CLAUDE-CONCEPT.md section 7.4.
// Both functions below hit {tenantUrl}/statemachine-api-configuration/...,
// NOT the location-api-v2 gateway — same base URL as section 7.2's
// premise-level call (app/api/settings/bartender/test/route.ts).

export interface LegacyLocation {
  id: number;
  code: string;
  name: string;
  level: string; // "premise" | "floor" | ...
  parent?: number | null; // for a floor, the id of its parent premise
  [key: string]: unknown;
}

export interface LegacyFloorMapImage {
  bytes: Buffer;
  contentType: string;
}

// Shared fetch/error-handling for tenant-URL-direct (statemachine-api-configuration)
// calls — same two error modes as callGateway (HTTP error vs. network/DNS
// failure), just against the tenant's own subdomain instead of a gateway host.
async function callTenantApi<T>(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  path: string
): Promise<GatewayResult<T>> {
  const url = `${tenantUrl.replace(/\/+$/, "")}${path}`;
  // Hand-written labels — statemachine-api-configuration has no spec doc here.
  const label = path.includes("level=floor") ? "List floors (legacy)" : "List premises (legacy)";

  let response: Response;
  try {
    response = await loggedFetch(userId, label, url, { headers: { apikey: apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, error: "Could not reach that tenant URL — check it's correct." };
  }

  if (!response.ok) {
    return { ok: false, error: `Bartender returned an error (HTTP ${response.status}).`, status: response.status };
  }

  const data = await response.json().catch(() => null);
  if (data === null) return { ok: false, error: "Unexpected response from Bartender." };
  return { ok: true, data: data as T };
}

async function listLegacyLocations(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  level: "premise" | "floor"
): Promise<GatewayResult<LegacyLocation[]>> {
  const result = await callTenantApi<unknown>(
    userId,
    tenantUrl,
    apiKey,
    `/statemachine-api-configuration/rest/configuration/locations?level=${level}`
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) return { ok: false, error: "Unexpected response shape from Bartender." };
  return { ok: true, data: result.data as LegacyLocation[] };
}

// GET {tenantUrl}/statemachine-api-configuration/rest/configuration/locations?level=floor
// header apikey — same auth as the already-working premise-level call.
export function listFloorLocations(
  userId: string,
  tenantUrl: string,
  apiKey: string
): Promise<GatewayResult<LegacyLocation[]>> {
  return listLegacyLocations(userId, tenantUrl, apiKey, "floor");
}

// Finds the floor sub-location for a given premise (site) code. CORRECTED
// 2026-08-28 after live-testing: section 7.4's original assumption — match
// the floor whose `name` equals the premise's `name` — never holds (checked
// against 3 real sites; a floor's `name` mirrors its own code, e.g.
// "TTMEMBASE", not the premise's display name "T&TMembase"). The reliable
// link is structural: a floor's `parent` field holds its premise's `id`.
// Returns null if no premise or floor is found (not an error).
export async function findFloorForPremiseCode(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  premiseCode: string
): Promise<GatewayResult<LegacyLocation | null>> {
  const premisesResult = await listLegacyLocations(userId, tenantUrl, apiKey, "premise");
  if (!premisesResult.ok) return premisesResult;
  const premise = premisesResult.data.find((p) => p.code === premiseCode);
  if (!premise) return { ok: true, data: null };

  const floorsResult = await listLegacyLocations(userId, tenantUrl, apiKey, "floor");
  if (!floorsResult.ok) return floorsResult;
  const floor = floorsResult.data.find((f) => f.parent === premise.id) ?? null;
  return { ok: true, data: floor };
}

// GET {tenantUrl}/statemachine-api-configuration/rest/configuration/locations/{floorLocationId}/maps
// header Authorization: Basic base64(username:password) — NOT apikey.
// CONFIRMED live 2026-08-28 (see CLAUDE-CONCEPT.md section 7.4): returns the
// RAW image bytes directly (Content-Type: image/png), not JSON metadata —
// callers must stream this server-side rather than expose a mapUrl.
export async function getLegacyFloorMap(
  userId: string,
  tenantUrl: string,
  username: string,
  password: string,
  floorLocationId: number
): Promise<GatewayResult<LegacyFloorMapImage>> {
  const url = `${tenantUrl.replace(/\/+$/, "")}/statemachine-api-configuration/rest/configuration/locations/${floorLocationId}/maps`;
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  let response: Response;
  try {
    // Hand-written label (no spec doc); binaryResponse so the image bytes
    // are never read into a log row.
    response = await loggedFetch(
      userId,
      "Get floor plan (legacy)",
      url,
      { headers: { Authorization: authHeader }, cache: "no-store" },
      { binaryResponse: true }
    );
  } catch {
    return { ok: false, error: "Could not reach the Track & Trace tenant for the legacy map endpoint." };
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      message = typeof parsed?.message === "string" ? parsed.message : raw;
    } catch {
      // Not JSON — keep the raw text.
    }
    return { ok: false, error: message || `Legacy map endpoint returned HTTP ${response.status}.`, status: response.status };
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return { ok: true, data: { bytes, contentType: response.headers.get("content-type") ?? "image/png" } };
}

export async function getLocationZones(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  code: string
): Promise<GatewayResult<LocationZone[]>> {
  const result = await callGateway<{ zones: RawZone[] }>(
    userId,
    tenantUrl,
    apiKey,
    `/locations/${encodeURIComponent(code)}/zones`
  );
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
