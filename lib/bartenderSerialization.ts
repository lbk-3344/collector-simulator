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
// this without an explicit instruction from Luc.

/** The quantity actually sent to the API for a requested amount — exported so the cap is unit-testable. */
export function cappedQuantity(requested: number): number {
  return Math.max(1, Math.min(Math.floor(Number(requested) || 0), MAX_NEW_ITEMS_PER_FIRING));
}

export class SerializationError extends Error {}

// GET {tenantUrl}/serialization-api/rest/serialization/hexas/sgtin96/gtin/{gtin}?quantity={n}
// HTTP Basic auth (same stored Track & Trace username/password as 7.4/7.7).
// Response: a plain JSON array of SGTIN-96 hex EPC strings, e.g.
// ["3034DF978000FA400000005D"]. Throws SerializationError on any non-2xx
// (e.g. a GTIN whose GS1 check digit the API rejects — see 7.6) or network
// failure, so a caller (the Part 2 run engine) can't mistake a failure for
// "zero items".
export async function mintSerializedItems(
  tenantUrl: string,
  username: string,
  password: string,
  gtin: string,
  quantity: number
): Promise<string[]> {
  const requested = Math.floor(Number(quantity) || 0);
  const capped = cappedQuantity(requested);
  if (requested > MAX_NEW_ITEMS_PER_FIRING) {
    // Surface, don't swallow — visible in logs that the cap did something.
    console.warn(
      `[serialization] requested quantity ${requested} clamped to ${capped} (MAX_NEW_ITEMS_PER_FIRING=${MAX_NEW_ITEMS_PER_FIRING})`
    );
  }

  const url = `${tenantUrl.replace(/\/+$/, "")}/serialization-api/rest/serialization/hexas/sgtin96/gtin/${encodeURIComponent(
    gtin
  )}?quantity=${capped}`;
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

  let epcs: string[] = [];
  try {
    const body = JSON.parse(raw);
    if (Array.isArray(body)) epcs = body.filter((x): x is string => typeof x === "string");
  } catch {
    throw new SerializationError("Unexpected (non-array) response from the Serialization API.");
  }
  return epcs;
}
