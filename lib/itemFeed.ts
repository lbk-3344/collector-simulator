// Item Feed shared type + create/update validation (BL-058,
// CLAUDE-CONCEPT.md section 16.1). Mirrors lib/deviceConfig.ts's
// validateChannels pattern — the API routes call buildItemFeedData and 400
// on a malformed body; the DB has no kind-specific constraints.

export type ItemFeedKind = "NEW" | "PRESENT" | "FIXED";

export interface ItemFeedRecord {
  id: string;
  name: string;
  kind: ItemFeedKind;
  gtin: string | null;
  categoryCode: string | null;
  quantityMin: number | null;
  quantityMax: number | null;
  locationCode: string | null;
  zoneCode: string | null;
  fixedItems: string[] | null;
  createdAt: string;
  updatedAt: string;
  // Present on list responses — how many TaskChannelInputs reference this feed.
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

  const gtin = str(body.gtin);
  const categoryCode = str(body.categoryCode);
  const locationCode = str(body.locationCode);
  const zoneCode = str(body.zoneCode);
  const fixedItems = Array.isArray(body.fixedItems)
    ? body.fixedItems.map((s: unknown) => String(s).trim()).filter(Boolean)
    : null;
  let quantityMin = nonNegInt(body.quantityMin);
  let quantityMax = nonNegInt(body.quantityMax);

  if (kind === "FIXED") {
    if (!fixedItems || fixedItems.length === 0) {
      return { error: "A FIXED item feed needs at least one item (EPC hex or URN)." };
    }
    quantityMin = null;
    quantityMax = null;
  } else {
    if (!gtin && !categoryCode) {
      return { error: "Pick a product (GTIN) or a category." };
    }
    if (quantityMin === null) quantityMin = 1;
    if (quantityMax === null) quantityMax = quantityMin;
    if (quantityMax < quantityMin) {
      return { error: "quantityMax must be greater than or equal to quantityMin." };
    }
  }

  if (kind === "PRESENT" && (!locationCode || !zoneCode)) {
    return { error: "A PRESENT item feed needs both a site and a zone." };
  }

  return {
    data: {
      name,
      kind,
      gtin: kind === "FIXED" ? null : gtin,
      categoryCode: kind === "FIXED" ? null : categoryCode,
      quantityMin,
      quantityMax,
      locationCode: kind === "PRESENT" ? locationCode : null,
      zoneCode: kind === "PRESENT" ? zoneCode : null,
      fixedItems: kind === "FIXED" ? fixedItems : null,
    },
  };
}
