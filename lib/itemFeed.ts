// Item Feed shared type + create/update validation (BL-058 revised
// 2026-08-30, CLAUDE-CONCEPT.md section 16.1). Multi-GTIN feeds; PRESENT
// gains a GTIN_LIST vs ALL match mode. Mirrors lib/deviceConfig.ts's
// validateChannels pattern — the API routes call buildItemFeedData and 400
// on a malformed body; the DB has no kind-specific constraints.
//
// BL-089 (2026-09-17): NEW's gs1Standard widened from 2 values to the full 8
// the platform's GET /gs1/standards lists. See CLAUDE-CONCEPT.md §7.6 "GS1
// standard expansion" for the full per-standard API contract this file's
// validation mirrors, and §7.6's "Live-testing findings" subsection for what
// was live-confirmed vs. the original spec draft.

export type ItemFeedKind = "NEW" | "PRESENT" | "FIXED";
export type PresentMatchMode = "GTIN_LIST" | "ALL";

export type Gs1Standard =
  | "sgtin-96"
  | "sgtin-198"
  | "sscc-96"
  | "grai-96"
  | "giai-96"
  | "gid-96"
  | "dsgtin-plus"
  | "dsgtin-plus-plus";

export const GS1_STANDARDS: Gs1Standard[] = [
  "sgtin-96",
  "sgtin-198",
  "sscc-96",
  "grai-96",
  "giai-96",
  "gid-96",
  "dsgtin-plus",
  "dsgtin-plus-plus",
];

// GTIN-based standards embed a product GTIN and use the existing GTIN
// picker; the other 4 carry their own standard-specific identifier fields
// instead and show no GTIN picker at all. Single source of truth — both
// buildItemFeedData below and lib/bartenderSerialization.ts's mint path key
// off this same list.
export const GTIN_BASED_STANDARDS: Gs1Standard[] = ["sgtin-96", "sgtin-198", "dsgtin-plus", "dsgtin-plus-plus"];
export const DSGTIN_STANDARDS: Gs1Standard[] = ["dsgtin-plus", "dsgtin-plus-plus"];

export function isGtinBasedStandard(standard: string | null): boolean {
  return GTIN_BASED_STANDARDS.includes((standard as Gs1Standard) ?? "sgtin-96");
}
export function isDsgtinStandard(standard: string | null): boolean {
  return DSGTIN_STANDARDS.includes(standard as Gs1Standard);
}

// Recommended filter defaults per standard (CLAUDE-CONCEPT.md §7.6) — the v3
// API has no default of its own, unlike the pre-BL-089 client's implicit
// omission. gid-96's isn't documented anywhere by the platform; 0 is a
// flagged, unconfirmed placeholder.
export const GS1_FILTER_DEFAULTS: Record<Gs1Standard, number> = {
  "sgtin-96": 3,
  "sgtin-198": 3,
  "dsgtin-plus": 3,
  "dsgtin-plus-plus": 3,
  "sscc-96": 0,
  "grai-96": 6,
  "giai-96": 6,
  "gid-96": 0, // unconfirmed — see CLAUDE-CONCEPT.md §7.6
};

export function normalizeGs1Standard(v: unknown): Gs1Standard {
  return GS1_STANDARDS.includes(v as Gs1Standard) ? (v as Gs1Standard) : "sgtin-96";
}

export interface ItemFeedRecord {
  id: string;
  // Per-user workspace ownership (BL-067).
  ownerId: string;
  shared: boolean;
  name: string;
  kind: ItemFeedKind;
  gtins: string[] | null;
  categoryCode: string | null;
  // NEW only — one of the 8 GS1_STANDARDS ids; null means "sgtin-96" (BL-073/BL-089).
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
  // BL-089 — NEW, non-GTIN standards' own identifier fields.
  companyPrefix: string | null;
  extensionDigit: string | null;
  assetType: string | null;
  itemReference: string | null;
  generalManagerNumber: string | null;
  objectClass: string | null;
  gs1Filter: number | null;
  // BL-089 — NEW, DSGTIN-only lot/date mechanism.
  gs1LotMode: string | null;
  gs1LotCode: string | null;
  // BL-089b (2026-09-17) — AUTO lot mode only.
  gs1LotRandomize: boolean | null;
  gs1LotGranularity: string | null;
  gs1DateField: string | null;
  gs1ShelfLifeDays: number | null;
  gs1DigitalLinkBaseUrl: string | null;
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
  const gs1Standard: Gs1Standard = kind === "NEW" ? normalizeGs1Standard(body.gs1Standard) : "sgtin-96";
  const locationCode = str(body.locationCode);
  const zoneCode = str(body.zoneCode);
  const fixedItems = strArr(body.fixedItems);
  const presentMatchMode: PresentMatchMode =
    body.presentMatchMode === "ALL" ? "ALL" : "GTIN_LIST";
  // PRESENT only. Missing / not-false = take-all (the common case, Luc 2026-09-03).
  const presentTakeAll = body.presentTakeAll !== false;
  let quantityMin = nonNegInt(body.quantityMin);
  let quantityMax = nonNegInt(body.quantityMax);

  // BL-089 standard-specific fields — only ever kept for kind === "NEW", and
  // only for the fields the resolved gs1Standard actually uses; everything
  // else is written back null further down.
  let companyPrefix: string | null = null;
  let extensionDigit: string | null = null;
  let assetType: string | null = null;
  let itemReference: string | null = null;
  let generalManagerNumber: string | null = null;
  let objectClass: string | null = null;
  let gs1Filter: number | null = null;
  let gs1LotMode: string | null = null;
  let gs1LotCode: string | null = null;
  let gs1LotRandomize: boolean | null = null;
  let gs1LotGranularity: string | null = null;
  let gs1DateField: string | null = null;
  let gs1ShelfLifeDays: number | null = null;
  let gs1DigitalLinkBaseUrl: string | null = null;

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

    const companyPrefixPattern = /^\d{6,12}$/;

    if (isGtinBasedStandard(gs1Standard)) {
      if (gtins.length === 0) {
        return { error: "A NEW item feed needs at least one GTIN." };
      }
    } else if (gs1Standard === "sscc-96") {
      companyPrefix = str(body.companyPrefix);
      if (!companyPrefix || !companyPrefixPattern.test(companyPrefix)) {
        return { error: "SSCC-96 needs a company prefix (6-12 digits)." };
      }
      extensionDigit = str(body.extensionDigit) ?? "0";
      if (!/^\d$/.test(extensionDigit)) {
        return { error: "SSCC-96's extension digit must be a single digit." };
      }
    } else if (gs1Standard === "grai-96") {
      companyPrefix = str(body.companyPrefix);
      if (!companyPrefix || !companyPrefixPattern.test(companyPrefix)) {
        return { error: "GRAI-96 needs a company prefix (6-12 digits)." };
      }
      assetType = str(body.assetType);
      if (!assetType) return { error: "GRAI-96 needs an asset type." };
    } else if (gs1Standard === "giai-96") {
      companyPrefix = str(body.companyPrefix);
      if (!companyPrefix || !companyPrefixPattern.test(companyPrefix)) {
        return { error: "GIAI-96 needs a company prefix (6-12 digits)." };
      }
      itemReference = str(body.itemReference);
      if (!itemReference) return { error: "GIAI-96 needs an individual asset reference." };
    } else if (gs1Standard === "gid-96") {
      generalManagerNumber = str(body.generalManagerNumber);
      objectClass = str(body.objectClass);
      if (!generalManagerNumber || !objectClass) {
        return { error: "GID-96 needs both a general manager number and an object class." };
      }
    }

    if (isDsgtinStandard(gs1Standard)) {
      if (gtins.length === 0) {
        return { error: "A NEW item feed needs at least one GTIN." };
      }
      gs1DateField = body.gs1DateField === "bestBeforeDate" ? "bestBeforeDate" : "expirationDate";
      gs1ShelfLifeDays = nonNegInt(body.gs1ShelfLifeDays);
      if (gs1ShelfLifeDays === null) {
        return { error: "Set a shelf-life period (in days) for the prioritized date." };
      }

      gs1LotMode = ["NONE", "AUTO", "FIXED"].includes(body.gs1LotMode) ? body.gs1LotMode : "AUTO";
      if (gs1LotMode === "FIXED") {
        gs1LotCode = str(body.gs1LotCode);
        if (!gs1LotCode || gs1LotCode.length > 20) {
          return { error: "A fixed lot code is required (1-20 characters) when lot mode is Fixed." };
        }
      } else {
        gs1LotCode = null; // AUTO generates fresh at fire time; NONE sends no lotCode at all
      }
      if (gs1LotMode === "AUTO") {
        // BL-089b — default true/"DAY" preserves BL-089's exact original
        // behavior (a fresh random 3-char suffix every firing) when unset.
        gs1LotRandomize = body.gs1LotRandomize === false ? false : true;
        gs1LotGranularity = body.gs1LotGranularity === "HALF_DAY" ? "HALF_DAY" : "DAY";
      } else {
        gs1LotRandomize = null;
        gs1LotGranularity = null;
      }

      // BL-089b — widened from dsgtin-plus-plus only to both DSGTIN standards.
      gs1DigitalLinkBaseUrl = str(body.gs1DigitalLinkBaseUrl) ?? "https://id.gs1.org";
      if (!/^https:\/\//.test(gs1DigitalLinkBaseUrl)) {
        return { error: "The Digital Link base URL must start with https://." };
      }
    }

    // gs1Filter — every NEW standard, always sent explicitly (no platform
    // default). Clamp rather than reject: a bad pre-fill shouldn't block saving.
    const filterRaw = nonNegInt(body.gs1Filter);
    gs1Filter = filterRaw === null ? GS1_FILTER_DEFAULTS[gs1Standard] : Math.max(0, Math.min(7, filterRaw));
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

  const gtinBased = kind === "NEW" && isGtinBasedStandard(gs1Standard);

  return {
    data: {
      name,
      kind,
      gtins: kind === "FIXED" ? null : kind === "NEW" && !gtinBased ? null : gtins.length ? gtins : null,
      categoryCode: kind === "FIXED" || (kind === "NEW" && !gtinBased) ? null : categoryCode,
      gs1Standard: kind === "NEW" ? gs1Standard : null,
      presentMatchMode: kind === "PRESENT" ? presentMatchMode : null,
      presentTakeAll: kind === "PRESENT" ? presentTakeAll : true,
      quantityMin,
      quantityMax,
      locationCode: kind === "PRESENT" ? locationCode : null,
      zoneCode: kind === "PRESENT" ? zoneCode : null,
      fixedItems: kind === "FIXED" ? fixedItems : null,
      companyPrefix,
      extensionDigit,
      assetType,
      itemReference,
      generalManagerNumber,
      objectClass,
      gs1Filter,
      gs1LotMode,
      gs1LotCode,
      gs1LotRandomize,
      gs1LotGranularity,
      gs1DateField,
      gs1ShelfLifeDays,
      gs1DigitalLinkBaseUrl,
    },
  };
}
