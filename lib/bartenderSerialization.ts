import { resolveGatewayUrl } from "@/lib/bartenderLocations";
import { loggedFetch } from "@/lib/apiCallLog";
import { type Gs1Standard, GTIN_BASED_STANDARDS, GS1_FILTER_DEFAULTS } from "@/lib/itemFeed";

// Client for Bartender's Serialization API v3 (`serialization-api-v3-updated`)
// — see CLAUDE-CONCEPT.md section 7.6. Migrated from the legacy
// `serialization-api` (HTTP Basic, GET .../hexas/sgtin96/...) on 2026-09-01
// once Luc confirmed v3 was live (BL-073). Widened 2026-09-17 (BL-089) from
// 2 standards to all 8 the platform's `GET /gs1/standards` lists.
//
// EVERY successful call is a REAL, PERMANENT write to the live Bartender
// tenant — the minted EPCs exist on the platform forever, there is no
// deregister/undo (unlike datacollector-api-v3, 7.5). The 10-item cap below
// is this app's own safety net and is enforced *inside* this function by
// clamping, so no bug at a call site can ask for more.

export type { Gs1Standard };

export function resolveSerializationGatewayUrl(tenantUrl: string): string {
  return `${resolveGatewayUrl(tenantUrl)}/serialization`;
}

export const MAX_NEW_ITEMS_PER_FIRING = 10; // Luc's explicit safety cap, 2026-08-30
// — "we will level up the limit later when it is fully baked in." Do NOT raise
// this without an explicit instruction from Luc. This is a TOTAL across
// however many GTINs one firing touches, NOT a per-GTIN allowance.

// The v3 endpoint requires companyPrefixLength alongside the GTIN for the
// GTIN-partitioning SGTIN standards only (it splits the GTIN into GS1
// company prefix + item reference). DSGTIN does NOT use this — "the new EPC
// schemes do not use partition tables" (spec's own words), live-confirmed:
// the platform rejects it if sent for dsgtin-plus/dsgtin-plus-plus. This app
// has NO live per-GTIN source for a real value — master-data-api (§7.7)
// would carry it but is still unavailable; the legacy product-api this app
// does call doesn't expose it. 7 is the most common real-world GCP length
// and is what Luc's own working example hardcodes. Revisit once a real
// per-GTIN value exists.
const DEFAULT_COMPANY_PREFIX_LENGTH = 7;

/** The total quantity actually minted for a requested amount — exported so the cap is unit-testable. */
export function cappedQuantity(requested: number): number {
  return Math.max(1, Math.min(Math.floor(Number(requested) || 0), MAX_NEW_ITEMS_PER_FIRING));
}

export class SerializationError extends Error {}

// Lot-code convention (BL-089, 2026-09-17) — NOT an "official" GS1
// algorithm; GS1 doesn't mandate a lot-number format, only that it's
// alphanumeric, <=20 chars, assigning company's discretion. This is a
// common-sense default, offered as an editable suggestion (gs1LotMode
// "AUTO"/"FIXED"'s "Suggest" button), same "suggest, never enforce" posture
// as collectorId (BL-050). Alphabet excludes visually-confusable I/O/0/1.
// L<YYMMDD>-<3-char suffix>, e.g. L250917-K3M — satisfies Luc's explicit
// "includes month, day" ask, 11 chars total, well under the 20-char cap.
const LOT_SUFFIX_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// BL-089b (2026-09-17): randomize/granularity, both optional and defaulting
// to BL-089's exact original behavior (randomize true, granularity "DAY") —
// Luc, using the shipped feature: "many times, the lot number will be the
// same for the whole day, or for a half day," plus turning the random
// suffix off entirely. granularity only visibly matters when randomize is
// false — with it on, the suffix already makes every code unique.
export interface LotCodeOptions {
  randomize?: boolean; // default true
  granularity?: "DAY" | "HALF_DAY"; // default "DAY"; half-day splits at server-clock noon
}

export function generateLotCode(now: Date = new Date(), opts: LotCodeOptions = {}): string {
  const randomize = opts.randomize !== false;
  const granularity = opts.granularity === "HALF_DAY" ? "HALF_DAY" : "DAY";
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  let code = `L${yy}${mm}${dd}`;
  if (granularity === "HALF_DAY") {
    code += now.getHours() < 12 ? "-AM" : "-PM";
  }
  if (randomize) {
    const suffix = Array.from(
      { length: 3 },
      () => LOT_SUFFIX_ALPHABET[Math.floor(Math.random() * LOT_SUFFIX_ALPHABET.length)]
    ).join("");
    code += `-${suffix}`;
  }
  return code;
}

// Shelf-life period -> real ISO date, computed fresh at the moment of
// minting (Luc's explicit ask: "please ask for a period instead of a final
// date, the final date should be computed by adding this period to the
// current date") — never at save time, never stored as a fixed date.
export function computeGs1Date(shelfLifeDays: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() + shelfLifeDays * 86_400_000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

interface Gs1GeneratedSerial {
  serialNumber?: string;
  hex?: string;
}

// One firing's worth of standard-specific input, independent of which GTIN
// (if any) a given generate() call is for — see Gs1MintOptions below.
export interface DsgtinContext {
  lotCode?: string; // omitted entirely in "NONE" lot mode
  expirationDate?: string; // YYYY-MM-DD — exactly one of these two is ever set
  bestBeforeDate?: string;
}

export interface Gs1MintOptions {
  userId: string;
  tenantUrl: string;
  apiKey: string;
  standard: Gs1Standard;
  quantity: number;
  filter?: number; // 0-7, always sent explicitly now — no platform default
  // GTIN-based only (sgtin-96/198, dsgtin-plus/plus-plus):
  gtin?: string;
  // non-GTIN only:
  companyPrefix?: string;
  extensionDigit?: string; // sscc-96
  assetType?: string; // grai-96
  itemReference?: string; // giai-96
  generalManagerNumber?: string; // gid-96
  objectClass?: string; // gid-96
  // dsgtin-plus / dsgtin-plus-plus only:
  context?: DsgtinContext;
  digitalLinkBaseUrl?: string; // DSGTIN only (widened to dsgtin-plus BL-089b) — TOP-LEVEL request field, not inside input
}

// Builds the standard-specific `input` object. GTIN-based SGTIN standards
// send companyPrefixLength; DSGTIN and every non-GTIN standard do not (live-
// confirmed 2026-09-17 — see CLAUDE-CONCEPT.md §7.6's "Live-testing findings").
function buildGs1Input(opts: Gs1MintOptions): Record<string, unknown> {
  const { standard } = opts;
  if (standard === "sgtin-96" || standard === "sgtin-198") {
    return { gtin: opts.gtin, companyPrefixLength: DEFAULT_COMPANY_PREFIX_LENGTH };
  }
  if (standard === "dsgtin-plus" || standard === "dsgtin-plus-plus") {
    return { gtin: opts.gtin, context: opts.context ?? {} };
  }
  if (standard === "sscc-96") {
    return { companyPrefix: opts.companyPrefix, extension: opts.extensionDigit };
  }
  if (standard === "grai-96") {
    return { companyPrefix: opts.companyPrefix, assetType: opts.assetType };
  }
  if (standard === "giai-96") {
    return { companyPrefix: opts.companyPrefix, itemReference: opts.itemReference };
  }
  // gid-96
  return { generalManagerNumber: opts.generalManagerNumber, objectClass: opts.objectClass };
}

// POST {gateway}/serialization/gs1/{standard}/generate. Auth is the bare
// lowercase `apikey` header — NOT `x-api-key` as the spec text claims (Luc's
// live curl, 2026-09-01; the same spec-vs-reality correction already on
// record for location-api-v2 / inventory-public-api / datacollector-api-v3).
// `Accept-Version: v2` per Luc's example. Requests `hex` only — the sole
// format this app stores / pushes to the platform (POST /reads' `hexa`
// field, §7.5 / BL-063) — confirmed 2026-09-17 that all 8 standards support
// it, so no formats picker is needed anywhere in this app.
async function generateGs1(opts: Gs1MintOptions): Promise<string[]> {
  const url = `${resolveSerializationGatewayUrl(opts.tenantUrl)}/gs1/${opts.standard}/generate`;
  const filter = opts.filter ?? GS1_FILTER_DEFAULTS[opts.standard];

  const body: Record<string, unknown> = {
    quantity: opts.quantity,
    formats: ["hex"],
    filter,
    serialSource: { mode: "internal" },
    input: buildGs1Input(opts),
  };
  // DSGTIN's Digital Link base URL is a TOP-LEVEL request field, sibling to
  // quantity/formats/filter/serialSource/input — never inside input/context
  // (live-confirmed 2026-09-17). Widened from dsgtin-plus-plus only to both
  // DSGTIN standards, BL-089b (Luc, using the shipped feature).
  if (opts.standard === "dsgtin-plus" || opts.standard === "dsgtin-plus-plus") {
    body.digitalLinkBaseUrl = opts.digitalLinkBaseUrl || "https://id.gs1.org";
  }

  let res: Response;
  try {
    res = await loggedFetch(opts.userId, "Generate GS1 identifiers", url, {
      method: "POST",
      headers: { apikey: opts.apiKey, "Accept-Version": "v2", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new SerializationError("Could not reach the Serialization API — check the tenant URL.");
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    let message = `The Serialization API returned HTTP ${res.status}.`;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.message) message = String(parsed.message);
    } catch {
      /* keep the generic message */
    }
    throw new SerializationError(message);
  }

  try {
    const parsed = JSON.parse(raw) as { serials?: Gs1GeneratedSerial[] };
    return (parsed.serials ?? []).map((s) => s.hex).filter((h): h is string => typeof h === "string");
  } catch {
    throw new SerializationError("Unexpected response from the Serialization API.");
  }
}

// One firing's worth of standard-specific fields, threaded from the
// ItemFeed row (lib/workflowRun.ts resolveBatch) into mintSerializedItems.
// Superset of Gs1MintOptions minus the per-call fields (userId/tenantUrl/
// apiKey/quantity are resolveBatch's own concern; gtin varies per GTIN group
// for GTIN-based standards).
export interface FeedGs1Fields {
  standard: Gs1Standard;
  filter?: number | null;
  companyPrefix?: string | null;
  extensionDigit?: string | null;
  assetType?: string | null;
  itemReference?: string | null;
  generalManagerNumber?: string | null;
  objectClass?: string | null;
  gs1LotMode?: string | null; // "NONE" | "AUTO" | "FIXED"
  gs1LotCode?: string | null; // FIXED mode only
  gs1LotRandomize?: boolean | null; // AUTO mode only (BL-089b)
  gs1LotGranularity?: string | null; // AUTO mode only, "DAY" | "HALF_DAY" (BL-089b)
  gs1DateField?: string | null; // "expirationDate" | "bestBeforeDate"
  gs1ShelfLifeDays?: number | null;
  gs1DigitalLinkBaseUrl?: string | null;
}

// Builds the shared DsgtinContext for one firing — same lot/date across
// every generate() call within that firing (computed once, not once per
// GTIN group), per BL-089's explicit "fresh every firing, not every mint"
// design.
function buildFiringContext(feed: FeedGs1Fields, now: Date): DsgtinContext | undefined {
  if (feed.gs1DateField == null && feed.gs1ShelfLifeDays == null && !feed.gs1LotMode) return undefined;
  const context: DsgtinContext = {};
  if (feed.gs1LotMode === "AUTO") {
    context.lotCode = generateLotCode(now, {
      randomize: feed.gs1LotRandomize !== false,
      granularity: feed.gs1LotGranularity === "HALF_DAY" ? "HALF_DAY" : "DAY",
    });
  } else if (feed.gs1LotMode === "FIXED" && feed.gs1LotCode) {
    context.lotCode = feed.gs1LotCode;
  }
  // "NONE" (or unset): no lotCode field at all — live-confirmed valid.
  const dateValue = computeGs1Date(feed.gs1ShelfLifeDays ?? 0, now);
  if (feed.gs1DateField === "bestBeforeDate") context.bestBeforeDate = dateValue;
  else context.expirationDate = dateValue;
  return context;
}

// Called by the run engine for a NEW-kind Item Feed's firing (BL-056 revised
// 2026-08-30 — a Feed can list several GTINs; BL-073 2026-09-01 — v3 client;
// BL-089 2026-09-17 — full 8-standard support). GTIN-based standards keep
// the original per-GTIN-group logic (quantity spread randomly across the
// feed's GTINs, one generate() call per distinct GTIN); non-GTIN standards
// make ONE generate() call for the whole (capped) quantity and return items
// with `gtin: null` throughout (same convention FIXED already uses
// downstream). `quantity` is clamped to MAX_NEW_ITEMS_PER_FIRING *in total*.
// Throws SerializationError on any failure so the caller can't mistake it
// for "zero items".
export async function mintSerializedItems(
  userId: string,
  tenantUrl: string,
  apiKey: string,
  gtins: string[],
  quantity: number,
  feed: FeedGs1Fields
): Promise<{ gtin: string | null; epc: string }[]> {
  const requested = Math.floor(Number(quantity) || 0);
  const total = cappedQuantity(requested);
  if (requested > MAX_NEW_ITEMS_PER_FIRING) {
    console.warn(
      `[serialization] requested total ${requested} clamped to ${total} (MAX_NEW_ITEMS_PER_FIRING=${MAX_NEW_ITEMS_PER_FIRING})`
    );
  }

  const baseOpts = {
    userId,
    tenantUrl,
    apiKey,
    standard: feed.standard,
    filter: feed.filter ?? undefined,
  };

  if (!GTIN_BASED_STANDARDS.includes(feed.standard)) {
    const opts: Gs1MintOptions = {
      ...baseOpts,
      quantity: total,
      companyPrefix: feed.companyPrefix ?? undefined,
      extensionDigit: feed.extensionDigit ?? undefined,
      assetType: feed.assetType ?? undefined,
      itemReference: feed.itemReference ?? undefined,
      generalManagerNumber: feed.generalManagerNumber ?? undefined,
      objectClass: feed.objectClass ?? undefined,
    };
    const epcs = await generateGs1(opts);
    return epcs.map((epc) => ({ gtin: null, epc }));
  }

  const list = gtins.map((g) => String(g).trim()).filter(Boolean);
  if (list.length === 0) throw new SerializationError("NEW feed has no GTIN to mint.");

  // Assign each unit a random GTIN, then group.
  const perGtin = new Map<string, number>();
  for (let i = 0; i < total; i++) {
    const g = list[Math.floor(Math.random() * list.length)];
    perGtin.set(g, (perGtin.get(g) ?? 0) + 1);
  }

  // DSGTIN's lot/date is computed ONCE per firing, shared across every GTIN
  // group's generate() call — not regenerated per group.
  const isDsgtin = feed.standard === "dsgtin-plus" || feed.standard === "dsgtin-plus-plus";
  const context = isDsgtin ? buildFiringContext(feed, new Date()) : undefined;

  const out: { gtin: string | null; epc: string }[] = [];
  for (const [gtin, count] of perGtin) {
    const opts: Gs1MintOptions = {
      ...baseOpts,
      quantity: count,
      gtin,
      context,
      digitalLinkBaseUrl: isDsgtin ? (feed.gs1DigitalLinkBaseUrl ?? undefined) : undefined,
    };
    const epcs = await generateGs1(opts);
    for (const epc of epcs) out.push({ gtin, epc });
  }
  return out;
}
