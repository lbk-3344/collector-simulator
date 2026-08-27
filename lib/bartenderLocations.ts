import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

// Client for Bartender's location-api-v2 — see CLAUDE-CONCEPT.md section 7.3.
// NOTE: as of 2026-08-27 this has been live-tested and does NOT authenticate
// successfully with the one known-good sandbox key (see section 7.3 for the
// exact requests/responses tried) — the staging gateway is also unreachable.
// This module is built exactly to the documented spec so it's ready to work
// once Luc resolves the auth question; callers must degrade gracefully
// rather than assume success.

const PRODUCTION_GATEWAY = "https://api.bartender-tt.com";
const STAGING_GATEWAY = "https://api.staging.bartender-tt.com";

// Pure — kept isolated from call sites because the exact substring match may
// need adjusting once tested against a real staging tenant URL (see
// CLAUDE-CONCEPT.md section 7.3's open question).
export function resolveGatewayUrl(tenantUrl: string): string {
  return tenantUrl.includes("staging.bartender-tt.com") ? STAGING_GATEWAY : PRODUCTION_GATEWAY;
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

export type GatewayResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

// Same two error modes as section 7.2's client (app/api/settings/bartender/test/route.ts):
// HTTP error status vs. network/DNS failure. Response shape here is unconfirmed,
// so parse defensively — try JSON, fall back to raw text — rather than assuming one format.
async function callGateway<T>(tenantUrl: string, apiKey: string, path: string): Promise<GatewayResult<T>> {
  const url = `${resolveGatewayUrl(tenantUrl)}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { "X-API-Key": apiKey }, cache: "no-store" });
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

export function listLocations(tenantUrl: string, apiKey: string) {
  return callGateway<BartenderLocation[]>(tenantUrl, apiKey, "/locations");
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
    response = await fetch(url, { headers: { "X-API-Key": apiKey }, cache: "no-store" });
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

export function getLocationZones(tenantUrl: string, apiKey: string, code: string) {
  return callGateway<LocationZone[]>(tenantUrl, apiKey, `/locations/${encodeURIComponent(code)}/zones`);
}
