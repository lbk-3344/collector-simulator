import { resolveGatewayUrl } from "@/lib/bartenderLocations";
import { loggedFetch } from "@/lib/apiCallLog";

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
export async function getStock(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  query: StockQuery
): Promise<StockResult> {
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
    res = await loggedFetch(userId, "Get current stock snapshot", url, {
      headers: { apikey: apiKey },
      cache: "no-store",
    });
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

// The tenant's configured in-stock look-back window. There's no settings
// endpoint (§7.8 — /settings, /inventory/config etc. all 404), but GET /stock
// echoes the tenant default in its response envelope when the param is
// omitted. A cheap 1-row page. Returns null if it can't be read.
export async function getConfiguredInStockWindowDays(
  userId: string,
  tenantUrl: string,
  apiKey: string
): Promise<number | null> {
  const url = `${resolveInventoryGatewayUrl(tenantUrl)}/stock?groupBy=zone&pageSize=1`;
  try {
    const res = await loggedFetch(userId, "Get current stock snapshot", url, {
      headers: { apikey: apiKey },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const b = (await res.json().catch(() => null)) as { inStockWindowDays?: number } | null;
    return typeof b?.inStockWindowDays === "number" ? b.inStockWindowDays : null;
  } catch {
    return null;
  }
}

export interface StockHexaRow {
  hexa: string;
  pid?: string | null; // = GTIN, present because we group by "hexa","product.pid"
  qty?: number;
}

export interface StockHexaResult {
  ok: boolean;
  rows: StockHexaRow[];
  total?: number;
  inStockWindowDays?: number;
  errorMessage?: string;
}

// POST {gateway}/inventory/stock/analytics with dimensions ["hexa",
// "product.pid"] — the EPC-level stock list (§7.8, live-probed 2026-09-02).
// This is what makes a PRESENT feed push REAL reads: each `hexa` is a
// 24-char SGTIN-96 that drops straight into POST /reads. `pids` (empty =
// ALL match mode) becomes a `product.pid` EQ filter. Server-side pagination
// is ignored (always pageSize:100) so callers slice client-side.
export async function getStockHexa(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  opts: { locationCode?: string; zoneCode?: string; pids?: string[]; inStockWindowDays?: number | null }
): Promise<StockHexaResult> {
  const pids = (opts.pids ?? []).map((p) => String(p).trim()).filter(Boolean);
  const filters: Array<{ field: string; operator: string; values: string[] }> = [];
  if (opts.locationCode) filters.push({ field: "location.code", operator: "eq", values: [opts.locationCode] });
  if (opts.zoneCode) filters.push({ field: "zone.code", operator: "eq", values: [opts.zoneCode] });
  if (pids.length > 0) filters.push({ field: "product.pid", operator: "eq", values: pids });

  const body: Record<string, unknown> = {
    filters,
    dimensions: ["hexa", "product.pid"],
    metrics: ["itemsQty"],
    sortBy: { itemsQty: "DESC" },
  };
  if (typeof opts.inStockWindowDays === "number") body.inStockWindowDays = opts.inStockWindowDays;

  const url = `${resolveInventoryGatewayUrl(tenantUrl)}/stock/analytics`;
  let res: Response;
  try {
    res = await loggedFetch(userId, "Get stock EPC list", url, {
      method: "POST",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, rows: [], errorMessage: "Could not reach the Inventory API — check the tenant URL." };
  }

  const raw = await res.text().catch(() => "");
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep raw */
  }
  if (!res.ok) {
    const message = (parsed as { message?: string } | null)?.message ?? `The Inventory API returned HTTP ${res.status}.`;
    return { ok: false, rows: [], errorMessage: message };
  }

  const pb = parsed as { results?: Array<{ hexa?: string; pid?: string; qty?: number }>; total?: number; inStockWindowDays?: number } | null;
  let rows: StockHexaRow[] = Array.isArray(pb?.results)
    ? pb!.results
        .filter((r): r is { hexa: string; pid?: string; qty?: number } => typeof r.hexa === "string" && r.hexa.length > 0)
        .map((r) => ({ hexa: r.hexa, pid: r.pid ?? null, qty: r.qty }))
    : [];
  // Safety net (same as getStock) — re-filter client-side in case the
  // sandbox ignored a server-side filter.
  if (pids.length > 0) rows = rows.filter((r) => r.pid != null && pids.includes(r.pid));

  return { ok: true, rows, total: pb?.total, inStockWindowDays: pb?.inStockWindowDays };
}
