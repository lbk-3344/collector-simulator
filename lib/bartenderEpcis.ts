import { loggedFetch } from "@/lib/apiCallLog";
import type { GatewayResult } from "@/lib/bartenderLocations";

// Client for Bartender's EPCIS Core API (BL-076a, CLAUDE-CONCEPT.md §7.9).
// One endpoint used: POST {tenantUrl}/epcis-core/rest/events/searches — HTTP
// Basic auth (the stored Track & Trace username/password, §7.4/7.7), NOT the
// apikey used by the gateway APIs.
//
// Response shape — LIVE-PROBED 2026-09-02 against demotrackandtrace.sandbox
// (the request `curl` Luc shared gave no sample response). Actual envelope:
//   { events: EpcisEvent[], hasmore: boolean, page: number }
// (the key is `events`, not `documents` as the request's pagination key
// hinted). Each event carries `epcList: [{ epc, gtin, sku, hexa, ... }]` —
// item count = epcList.length (no quantityList seen for tool-generated
// reads). `premise` is a plain string that EQUALS this app's own
// Location.code (verified: filtering premise=EQ "TTMEMBASE" returned only
// events whose `premise` field was exactly "TTMEMBASE") — the BL-070
// zone-code mismatch does NOT recur here.

export const EPCIS_EVENTS_LIMIT = 20; // Luc's "last 20 EPCIS events"; his curl demos use 100

export interface EpcisEpc {
  epc?: string;
  gtin?: string | null;
  sku?: string | null;
  hexa?: string | null;
}

export interface EpcisEvent {
  id: string;
  type: string; // "ObjectEvent" | "AggregationEvent" | ...
  eventTime: string;
  recordTime?: string;
  bizStep?: string | null; // URN, e.g. urn:epcglobal:cbv:bizstep:receiving
  disposition?: string | null;
  readPoint?: string | null;
  bizLocation?: string | null;
  premise?: string | null; // == Location.code (verified 2026-09-02)
  action?: string | null;
  epcList?: EpcisEpc[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any; // keep the raw event intact for the detail modal
}

// Last path segment of a bizStep URN — "urn:epcglobal:cbv:bizstep:receiving"
// -> "receiving". No existing helper for this in the app.
export function formatBizStep(bizStep: string | null | undefined): string {
  if (!bizStep) return "";
  const parts = bizStep.split(/[:/]/).filter(Boolean);
  return parts[parts.length - 1] ?? bizStep;
}

export function epcisItemCount(event: EpcisEvent): number {
  return Array.isArray(event.epcList) ? event.epcList.length : 0;
}

export async function searchEpcisEvents(
  userId: string,
  tenantUrl: string,
  username: string,
  password: string,
  opts: { locationCode?: string } = {}
): Promise<GatewayResult<EpcisEvent[]>> {
  const filters: Array<{ property: string; operator: string; values: string[] }> = [
    { property: "type", operator: "WD", values: ["*Event"] },
  ];
  if (opts.locationCode) {
    filters.push({ property: "premise", operator: "EQ", values: [opts.locationCode] });
  }

  const url = `${tenantUrl.replace(/\/+$/, "")}/epcis-core/rest/events/searches`;
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  let res: Response;
  try {
    res = await loggedFetch(userId, "Search EPCIS events", url, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        order: { property: "eventTime", direction: "DESC" },
        pagination: { documents: EPCIS_EVENTS_LIMIT, page: 0 },
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach the EPCIS Core API — check the tenant URL." };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Bartender rejected the Track & Trace username/password.", status: res.status };
  }
  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    let message = `The EPCIS Core API returned HTTP ${res.status}.`;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.message === "string") message = parsed.message;
    } catch {
      /* keep the generic message */
    }
    return { ok: false, error: message, status: res.status };
  }

  let body: { events?: EpcisEvent[] } | null = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: "Unexpected response from the EPCIS Core API." };
  }
  return { ok: true, data: Array.isArray(body?.events) ? body!.events : [] };
}
