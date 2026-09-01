import { resolveGatewayUrl } from "@/lib/bartenderLocations";

// Client for Bartender's Serialization API v3 (`serialization-api-v3-updated`)
// — see CLAUDE-CONCEPT.md section 7.6. Migrated from the legacy
// `serialization-api` (HTTP Basic, GET .../hexas/sgtin96/...) on 2026-09-01
// once Luc confirmed v3 was live (BL-073).
//
// EVERY successful call is a REAL, PERMANENT write to the live Bartender
// tenant — the minted EPCs exist on the platform forever, there is no
// deregister/undo (unlike datacollector-api-v3, 7.5). The 10-item cap below
// is this app's own safety net and is enforced *inside* this function by
// clamping, so no bug at a call site can ask for more.

export function resolveSerializationGatewayUrl(tenantUrl: string): string {
  return `${resolveGatewayUrl(tenantUrl)}/serialization`;
}

// GS1 standards this app currently supports minting. grai-96/sscc-96/giai-96
// are also live on the platform (per Luc, 2026-09-01) but identify different
// business objects than ItemFeed's GTIN-based product model, so they need a
// data-model conversation first — see BL-073's follow-up note.
export type Gs1Standard = "sgtin-96" | "sgtin-198";

export const MAX_NEW_ITEMS_PER_FIRING = 10; // Luc's explicit safety cap, 2026-08-30
// — "we will level up the limit later when it is fully baked in." Do NOT raise
// this without an explicit instruction from Luc. This is a TOTAL across
// however many GTINs one firing touches, NOT a per-GTIN allowance.

// The v3 endpoint requires companyPrefixLength alongside the GTIN (it splits
// the GTIN into GS1 company prefix + item reference). This app has NO live
// source for a real per-product value yet — master-data-api (§7.7) models it
// on its Product schema but isn't available; the legacy product-api this app
// does call doesn't expose it. 7 is the most common real-world GCP length and
// is what Luc's own working example hardcodes. Revisit once a real per-GTIN
// value exists.
const DEFAULT_COMPANY_PREFIX_LENGTH = 7;

/** The total quantity actually minted for a requested amount — exported so the cap is unit-testable. */
export function cappedQuantity(requested: number): number {
  return Math.max(1, Math.min(Math.floor(Number(requested) || 0), MAX_NEW_ITEMS_PER_FIRING));
}

export class SerializationError extends Error {}

interface Gs1GeneratedSerial {
  serialNumber?: string;
  hex?: string;
  epcUrn?: string;
  epcTagUri?: string;
}

// POST {gateway}/serialization/gs1/{standard}/generate. Auth is the bare
// lowercase `apikey` header — NOT `x-api-key` as the spec text claims (Luc's
// live curl, 2026-09-01; the same spec-vs-reality correction already on
// record for location-api-v2 / inventory-public-api / datacollector-api-v3).
// `Accept-Version: v2` per Luc's example. Requests `hex` only — the sole
// format this app stores / pushes to the platform (POST /reads' `hexa` field,
// §7.5 / BL-063).
async function generateGs1(
  tenantUrl: string,
  apiKey: string,
  standard: Gs1Standard,
  gtin: string,
  quantity: number
): Promise<string[]> {
  const url = `${resolveSerializationGatewayUrl(tenantUrl)}/gs1/${standard}/generate`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { apikey: apiKey, "Accept-Version": "v2", "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity,
        formats: ["hex"],
        serialSource: { mode: "internal" },
        input: { gtin, companyPrefixLength: DEFAULT_COMPANY_PREFIX_LENGTH },
      }),
      cache: "no-store",
    });
  } catch {
    throw new SerializationError("Could not reach the Serialization API — check the tenant URL.");
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    let message = `The Serialization API returned HTTP ${res.status}.`;
    try {
      const body = JSON.parse(raw);
      if (body?.message) message = String(body.message);
    } catch {
      /* keep the generic message */
    }
    throw new SerializationError(message);
  }

  try {
    const body = JSON.parse(raw) as { serials?: Gs1GeneratedSerial[] };
    return (body.serials ?? []).map((s) => s.hex).filter((h): h is string => typeof h === "string");
  } catch {
    throw new SerializationError("Unexpected response from the Serialization API.");
  }
}

// Called by the run engine for a NEW-kind Item Feed's firing (BL-056 revised
// 2026-08-30 — a Feed can list several GTINs; BL-073 2026-09-01 — v3 client,
// optional per-feed `standard`). `quantity` is clamped to
// MAX_NEW_ITEMS_PER_FIRING *in total*, then each unit is assigned a uniformly
// random GTIN from `gtins`, grouped, and minted per distinct GTIN — the
// per-GTIN allocation policy from CLAUDE-CONCEPT.md 16.1 (flagged as not yet
// Luc-confirmed). Returns `{ gtin, epc }[]` so the caller knows which item is
// which GTIN. Throws SerializationError on any failure so the caller can't
// mistake it for "zero items".
export async function mintSerializedItems(
  tenantUrl: string,
  apiKey: string,
  gtins: string[],
  quantity: number,
  standard: Gs1Standard = "sgtin-96"
): Promise<{ gtin: string; epc: string }[]> {
  const list = gtins.map((g) => String(g).trim()).filter(Boolean);
  if (list.length === 0) throw new SerializationError("NEW feed has no GTIN to mint.");

  const requested = Math.floor(Number(quantity) || 0);
  const total = cappedQuantity(requested);
  if (requested > MAX_NEW_ITEMS_PER_FIRING) {
    console.warn(
      `[serialization] requested total ${requested} clamped to ${total} (MAX_NEW_ITEMS_PER_FIRING=${MAX_NEW_ITEMS_PER_FIRING}, across ${list.length} GTIN(s))`
    );
  }

  // Assign each unit a random GTIN, then group.
  const perGtin = new Map<string, number>();
  for (let i = 0; i < total; i++) {
    const g = list[Math.floor(Math.random() * list.length)];
    perGtin.set(g, (perGtin.get(g) ?? 0) + 1);
  }

  const out: { gtin: string; epc: string }[] = [];
  for (const [gtin, count] of perGtin) {
    const epcs = await generateGs1(tenantUrl, apiKey, standard, gtin, count);
    for (const epc of epcs) out.push({ gtin, epc });
  }
  return out;
}
