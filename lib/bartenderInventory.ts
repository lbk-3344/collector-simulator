import { resolveGatewayUrl } from "@/lib/bartenderLocations";

// Client for Bartender's Inventory API (`inventory-public-api`) — see
// CLAUDE-CONCEPT.md section 7.8. Feeds the Item Feed `PRESENT` kind (Part 2's
// run engine); no standalone UI in this batch.
//
// Live-confirmed 2026-08-30: reached via the same two fixed gateway hosts as
// location-api-v2 / datacollector-api-v3 (`api[.sandbox].bartender-tt.com`)
// with a `/inventory` suffix, authenticated by a **bare `apikey` header** —
// NOT the "Basic + apiKey together" the spec text implied (adding Basic makes
// the gateway demand an `x-tenant` header and then 401).

export function resolveInventoryGatewayUrl(tenantUrl: string): string {
  return `${resolveGatewayUrl(tenantUrl)}/inventory`;
}

export interface StockRow {
  locationCode: string;
  locationName?: string;
  zoneCode?: string;
  zoneName?: string;
  sku: string;
  pid?: string; // = GTIN
  productLabel?: string;
  qty: number;
  lastSeenAt?: string;
}

export interface StockResult {
  ok: boolean;
  results: StockRow[];
  total?: number;
  asOf?: string;
  inStockWindowDays?: number;
  errorMessage?: string;
}

export interface StockQuery {
  locationCode?: string;
  zoneCode?: string;
  // GTIN filter(s). Omit / empty = "all GTINs present in the zone" — the
  // PRESENT feed's ALL match mode (2026-08-30 revision).
  pids?: string[];
  sku?: string;
  groupBy?: "sku" | "pid" | "zone";
  page?: number;
  pageSize?: number;
}

// GET {gateway}/inventory/stock. The PRESENT lookup uses groupBy=zone. NB:
// the sandbox was observed to IGNORE the locationCode/zoneCode/pid filter
// params server-side, so we also filter `results` client-side as a safety
// net (see 7.8) — harmless if the real API does filter properly.
export async function getStock(tenantUrl: string, apiKey: string, query: StockQuery): Promise<StockResult> {
  const pids = (query.pids ?? []).map((p) => String(p).trim()).filter(Boolean);
  const params = new URLSearchParams();
  params.set("groupBy", query.groupBy ?? "zone");
  if (query.locationCode) params.set("locationCode", query.locationCode);
  if (query.zoneCode) params.set("zoneCode", query.zoneCode);
  for (const p of pids) params.append("pid", p);
  if (query.sku) params.set("sku", query.sku);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  const url = `${resolveInventoryGatewayUrl(tenantUrl)}/stock?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { apikey: apiKey }, cache: "no-store" });
  } catch {
    return { ok: false, results: [], errorMessage: "Could not reach the Inventory API — check the tenant URL." };
  }

  const raw = await res.text().catch(() => "");
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep raw */
  }

  if (!res.ok) {
    const message = (body as { message?: string } | null)?.message ?? `The Inventory API returned HTTP ${res.status}.`;
    return { ok: false, results: [], errorMessage: message };
  }
  // The sandbox returns 200 with { error: "..." } on a query it can't handle.
  const inlineError = (body as { error?: string } | null)?.error;
  if (inlineError) {
    return { ok: false, results: [], errorMessage: String(inlineError) };
  }

  const b = body as {
    results?: StockRow[];
    total?: number;
    asOf?: string;
    inStockWindowDays?: number;
  } | null;
  let results = Array.isArray(b?.results) ? b!.results : [];
  if (query.locationCode) results = results.filter((r) => r.locationCode === query.locationCode);
  if (query.zoneCode) results = results.filter((r) => r.zoneCode === query.zoneCode);
  if (pids.length > 0) results = results.filter((r) => r.pid != null && pids.includes(r.pid));

  return {
    ok: true,
    results,
    total: b?.total,
    asOf: b?.asOf,
    inStockWindowDays: b?.inStockWindowDays,
  };
}
