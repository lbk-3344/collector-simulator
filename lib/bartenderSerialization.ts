// Client for Bartender's LEGACY Serialization API (`serialization-api`) —
// see CLAUDE-CONCEPT.md section 7.6. Temporary stand-in until
// `serialization-api-v3-updated` is available; kept a thin, swappable module.
//
// EVERY successful call is a REAL, PERMANENT write to the live Bartender
// tenant — the minted EPCs exist on the platform forever, there is no
// deregister/undo (unlike datacollector-api-v3, 7.5). The 10-item cap below
// is this app's own safety net and is enforced *inside* this function by
// clamping, so no bug at a call site can ask for more.

export const MAX_NEW_ITEMS_PER_FIRING = 10; // Luc's explicit safety cap, 2026-08-30
// — "we will level up the limit later when it is fully baked in." Do NOT raise
// this without an explicit instruction from Luc. This is a TOTAL across
// however many GTINs one firing touches, NOT a per-GTIN allowance.

/** The total quantity actually minted for a requested amount — exported so the cap is unit-testable. */
export function cappedQuantity(requested: number): number {
  return Math.max(1, Math.min(Math.floor(Number(requested) || 0), MAX_NEW_ITEMS_PER_FIRING));
}

export class SerializationError extends Error {}

// GET {tenantUrl}/serialization-api/rest/serialization/hexas/sgtin96/gtin/{gtin}?quantity={n}
// HTTP Basic auth. Response: a plain JSON array of SGTIN-96 hex EPC strings.
async function mintForOneGtin(
  tenantUrl: string,
  username: string,
  password: string,
  gtin: string,
  quantity: number
): Promise<string[]> {
  const url = `${tenantUrl.replace(/\/+$/, "")}/serialization-api/rest/serialization/hexas/sgtin96/gtin/${encodeURIComponent(
    gtin
  )}?quantity=${quantity}`;
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: auth }, cache: "no-store" });
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
    const body = JSON.parse(raw);
    if (Array.isArray(body)) return body.filter((x): x is string => typeof x === "string");
  } catch {
    throw new SerializationError("Unexpected (non-array) response from the Serialization API.");
  }
  return [];
}

// Called by the run engine for a NEW-kind Item Feed's firing (BL-056 revised
// 2026-08-30 — a Feed can list several GTINs). `quantity` is clamped to
// MAX_NEW_ITEMS_PER_FIRING *in total*, then each unit is assigned a uniformly
// random GTIN from `gtins`, grouped, and minted per distinct GTIN — the
// per-GTIN allocation policy from CLAUDE-CONCEPT.md 16.1 (flagged as not yet
// Luc-confirmed). Returns `{ gtin, epc }[]` so the caller knows which item is
// which GTIN. Throws SerializationError on any failure so the caller can't
// mistake it for "zero items".
export async function mintSerializedItems(
  tenantUrl: string,
  username: string,
  password: string,
  gtins: string[],
  quantity: number
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
    const epcs = await mintForOneGtin(tenantUrl, username, password, gtin, count);
    for (const epc of epcs) out.push({ gtin, epc });
  }
  return out;
}
