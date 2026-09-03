// Item Feed shared type + create/update validation (BL-058 revised
// 2026-08-30, CLAUDE-CONCEPT.md section 16.1). Multi-GTIN feeds; PRESENT
// gains a GTIN_LIST vs ALL match mode. Mirrors lib/deviceConfig.ts's
// validateChannels pattern — the API routes call buildItemFeedData and 400
// on a malformed body; the DB has no kind-specific constraints.

export type ItemFeedKind = "NEW" | "PRESENT" | "FIXED";
export type PresentMatchMode = "GTIN_LIST" | "ALL";

export interface ItemFeedRecord {
  id: string;
  // Per-user workspace ownership (BL-067).
  ownerId: string;
  shared: boolean;
  name: string;
  kind: ItemFeedKind;
  gtins: string[] | null;
  categoryCode: string | null;
  // NEW only — "sgtin-96" (default; null means the same) or "sgtin-198" (BL-073).
  gs1Standard: string | null;
  presentMatchMode: PresentMatchMode | null;
  // PRESENT only. true = each firing pushes the whole zone stock; false =
  // cap at quantityMax (BL-070b).
  presentTakeAll: boolean;
  quantityMin: number | null;
  quantityMax: number | null;
  locationCode: string | null;
  zoneCode: string | null;
  fixedItems: string[] | null;
  createdAt: string;
  updatedAt: string;
  // Present on list responses — how many FeedNodes place this feed.
  usageCount?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildItemFeedData(body: any): { error: string } | { data: Record<string, unknown> } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "name is required" };

  const kind = body?.kind;
  if (kind !== "NEW" && kind !== "PRESENT" && kind !== "FIXED") {
    return { error: "kind must be NEW, PRESENT or FIXED" };
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const nonNegInt = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  const strArr = (v: unknown) =>
    Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];

  const gtins = strArr(body.gtins);
  const categoryCode = str(body.categoryCode);
  // NEW only. Only "sgtin-198" is a non-default choice; anything else (incl.
  // "sgtin-96", null, garbage) normalizes to null = default sgtin-96 (BL-073).
  const gs1Standard = body.gs1Standard === "sgtin-198" ? "sgtin-198" : null;
  const locationCode = str(body.locationCode);
  const zoneCode = str(body.zoneCode);
  const fixedItems = strArr(body.fixedItems);
  const presentMatchMode: PresentMatchMode =
    body.presentMatchMode === "ALL" ? "ALL" : "GTIN_LIST";
  // PRESENT only. Missing / not-false = take-all (the common case, Luc 2026-09-03).
  const presentTakeAll = body.presentTakeAll !== false;
  let quantityMin = nonNegInt(body.quantityMin);
  let quantityMax = nonNegInt(body.quantityMax);

  if (kind === "FIXED") {
    if (fixedItems.length === 0) {
      return { error: "A FIXED item feed needs at least one item (EPC hex or URN)." };
    }
    quantityMin = null;
    quantityMax = null;
  } else if (kind === "NEW") {
    // NEW — quantity range
    if (quantityMin === null) quantityMin = 1;
    if (quantityMax === null) quantityMax = quantityMin;
    if (quantityMax < quantityMin) {
      return { error: "quantityMax must be greater than or equal to quantityMin." };
    }
    if (gtins.length === 0) {
      return { error: "A NEW item feed needs at least one GTIN." };
    }
  } else {
    // PRESENT — no minimum; quantityMax is a per-firing cap, used only when
    // not taking the whole stock (BL-070b).
    quantityMin = null;
    if (presentTakeAll) {
      quantityMax = null;
    } else if (quantityMax === null || quantityMax < 1) {
      return { error: 'Set a maximum of at least 1, or turn on "All items in stock".' };
    }
    if (!locationCode || !zoneCode) {
      return { error: "A PRESENT item feed needs both a site and a zone." };
    }
    if (presentMatchMode === "GTIN_LIST" && gtins.length === 0) {
      return { error: "A PRESENT feed in GTIN-list mode needs at least one GTIN." };
    }
  }

  return {
    data: {
      name,
      kind,
      gtins: kind === "FIXED" ? null : gtins.length ? gtins : null,
      categoryCode: kind === "FIXED" ? null : categoryCode,
      gs1Standard: kind === "NEW" ? gs1Standard : null,
      presentMatchMode: kind === "PRESENT" ? presentMatchMode : null,
      presentTakeAll: kind === "PRESENT" ? presentTakeAll : true,
      quantityMin,
      quantityMax,
      locationCode: kind === "PRESENT" ? locationCode : null,
      zoneCode: kind === "PRESENT" ? zoneCode : null,
      fixedItems: kind === "FIXED" ? fixedItems : null,
    },
  };
}
