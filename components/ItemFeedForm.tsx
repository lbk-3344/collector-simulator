"use client";

import { useEffect, useState } from "react";
import { ProductPicker } from "@/components/ProductPicker";
import type { ItemFeedKind, ItemFeedRecord, PresentMatchMode } from "@/lib/itemFeed";
import { GS1_FILTER_DEFAULTS } from "@/lib/itemFeed";

// Client-side copy of lib/bartenderSerialization.ts's generateLotCode — that
// module pulls in server-only Prisma/fetch code (via bartenderLocations /
// apiCallLog) so it can't be imported here. Same algorithm, kept in sync by
// hand; only used for the form's "Suggest" button preview, the real mint
// always regenerates server-side at fire time anyway.
function generateLotCode(now: Date = new Date()): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const suffix = Array.from({ length: 3 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `L${yy}${mm}${dd}-${suffix}`;
}

interface SiteOption {
  code: string;
  name: string;
}
interface ZoneOption {
  code: string;
  name: string;
}

export const KINDS: { value: ItemFeedKind; label: string; info: string }[] = [
  {
    value: "NEW",
    label: "New",
    info: "Mints brand-new serialized items on the live Bartender Track & Trace platform every time this feed fires — these items are real and permanent, there's no undo. Capped at 10 items per firing.",
  },
  {
    value: "PRESENT",
    label: "In stock",
    info: "Pulls from what's actually in stock in a specific site + zone right now (via the Inventory API). A firing can come back with fewer items than requested — or none — if the zone is empty.",
  },
  {
    value: "FIXED",
    label: "Fixed",
    info: "Sends the exact same explicit list of items (EPC hex or URN) every time this feed fires. Nothing is minted or looked up.",
  },
];

// Identifier-format options (BL-089, 2026-09-17) — GTIN-based first, then the
// 4 non-GTIN standards. Grouped via <optgroup>.
const GTIN_STANDARD_OPTIONS: { value: string; label: string; info: string }[] = [
  { value: "sgtin-96", label: "SGTIN-96 (default)", info: "The GS1 EPC encoding everything downstream expects. Embeds a GTIN + serial." },
  { value: "sgtin-198", label: "SGTIN-198", info: "Same identity, a longer alphanumeric serial." },
  {
    value: "dsgtin-plus",
    label: "DS-SGTIN+ (TDS 2.0)",
    info: "SGTIN + a GS1 date (production/packaging/best-before/sell-by/expiration/first-freeze/harvest) baked into the tag, for RFID date filtering. Note: on the current Track & Trace platform version (T&T 12.6), items minted this way don't resolve a GTIN downstream — expected to be fixed in T&T 12.7. See CLAUDE-CONCEPT.md §7.6.",
  },
  {
    value: "dsgtin-plus-plus",
    label: "DS-SGTIN++ (TDS 2.0, custom domain)",
    info: "Same as DS-SGTIN+, plus a lot code and a custom Digital Link domain. Note: on the current Track & Trace platform version (T&T 12.6), items minted this way don't resolve a GTIN downstream — expected to be fixed in T&T 12.7. See CLAUDE-CONCEPT.md §7.6.",
  },
];
const NON_GTIN_STANDARD_OPTIONS: { value: string; label: string; info: string }[] = [
  { value: "sscc-96", label: "SSCC-96", info: "Logistic units — pallets, cases. No GTIN; identified by a company prefix instead." },
  { value: "grai-96", label: "GRAI-96", info: "Returnable assets — crates, kegs, trays. Identified by a company prefix + asset type." },
  { value: "giai-96", label: "GIAI-96", info: "Individual assets, tracked one at a time. Identified by a company prefix + asset reference." },
  { value: "gid-96", label: "GID-96", info: "A general identifier with no GS1 company prefix at all — a general manager number + object class instead." },
];
const ALL_STANDARD_OPTIONS = [...GTIN_STANDARD_OPTIONS, ...NON_GTIN_STANDARD_OPTIONS];
const GTIN_STANDARDS = new Set(GTIN_STANDARD_OPTIONS.map((o) => o.value));
const DSGTIN_STANDARDS = new Set(["dsgtin-plus", "dsgtin-plus-plus"]);

type ShelfLifeUnit = "days" | "weeks" | "months";
const SHELF_LIFE_FACTORS: Record<ShelfLifeUnit, number> = { days: 1, weeks: 7, months: 30 };

// Standalone Item Feed create/edit form (BL-058 revised) — kind-branching
// with per-kind info text, multi-GTIN, PRESENT GTIN-list vs ALL. BL-089
// (2026-09-17): NEW's identifier-format grows from 2 to 8 standards, with
// per-standard identifier fields and a DSGTIN lot/date block. Reused by the
// Item Feeds library page and (Part 2) the canvas "+ New Feed" flow.
export function ItemFeedForm({
  feed,
  onSaved,
  onCancel,
  readOnly = false,
}: {
  feed: ItemFeedRecord | null;
  onSaved: (saved: ItemFeedRecord) => void;
  onCancel: () => void;
  // True when this feed is visible only because it's shared (BL-068) — every
  // field is shown but inert, the footer is a single Close.
  readOnly?: boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ItemFeedKind>("NEW");
  const [gtins, setGtins] = useState<string[]>([]);
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
  const [presentMatchMode, setPresentMatchMode] = useState<PresentMatchMode>("GTIN_LIST");
  const [presentTakeAll, setPresentTakeAll] = useState(true);
  const [quantityMin, setQuantityMin] = useState(1);
  const [quantityMax, setQuantityMax] = useState(1);
  const [gs1Standard, setGs1Standard] = useState("sgtin-96"); // NEW only (BL-073/BL-089)
  const [locationCode, setLocationCode] = useState("");
  const [zoneCode, setZoneCode] = useState("");
  const [fixedItems, setFixedItems] = useState<string[]>([""]);

  // BL-089 — non-GTIN standards' own identifier fields.
  const [companyPrefix, setCompanyPrefix] = useState("");
  const [extensionDigit, setExtensionDigit] = useState("0");
  const [assetType, setAssetType] = useState("");
  const [itemReference, setItemReference] = useState("");
  const [generalManagerNumber, setGeneralManagerNumber] = useState("");
  const [objectClass, setObjectClass] = useState("");
  const [gs1Filter, setGs1Filter] = useState(3);

  // BL-089 — DSGTIN lot/date mechanism.
  const [gs1LotMode, setGs1LotMode] = useState<"NONE" | "AUTO" | "FIXED">("AUTO");
  const [gs1LotCode, setGs1LotCode] = useState("");
  const [gs1LotRandomize, setGs1LotRandomize] = useState(true); // BL-089b, AUTO mode only
  const [gs1LotGranularity, setGs1LotGranularity] = useState<"DAY" | "HALF_DAY">("DAY"); // BL-089b
  const [gs1DateField, setGs1DateField] = useState<"expirationDate" | "bestBeforeDate">("expirationDate");
  const [shelfLifeValue, setShelfLifeValue] = useState(30);
  const [shelfLifeUnit, setShelfLifeUnit] = useState<ShelfLifeUnit>("days");
  const [gs1DigitalLinkBaseUrl, setGs1DigitalLinkBaseUrl] = useState("https://id.gs1.org");

  const [sites, setSites] = useState<SiteOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(feed?.name ?? "");
    setKind(feed?.kind ?? "NEW");
    setGtins(feed?.gtins ?? []);
    setCategoryCode(feed?.categoryCode ?? null);
    setPresentMatchMode(feed?.presentMatchMode ?? "GTIN_LIST");
    setPresentTakeAll(feed?.presentTakeAll ?? true);
    setQuantityMin(feed?.quantityMin ?? 1);
    setQuantityMax(feed?.quantityMax ?? feed?.quantityMin ?? 1);
    const standard = feed?.gs1Standard || "sgtin-96";
    setGs1Standard(standard);
    setLocationCode(feed?.locationCode ?? "");
    setZoneCode(feed?.zoneCode ?? "");
    setFixedItems(feed?.fixedItems?.length ? feed.fixedItems : [""]);

    setCompanyPrefix(feed?.companyPrefix ?? "");
    setExtensionDigit(feed?.extensionDigit ?? "0");
    setAssetType(feed?.assetType ?? "");
    setItemReference(feed?.itemReference ?? "");
    setGeneralManagerNumber(feed?.generalManagerNumber ?? "");
    setObjectClass(feed?.objectClass ?? "");
    setGs1Filter(feed?.gs1Filter ?? GS1_FILTER_DEFAULTS[standard as keyof typeof GS1_FILTER_DEFAULTS] ?? 3);

    setGs1LotMode((feed?.gs1LotMode as "NONE" | "AUTO" | "FIXED") ?? "AUTO");
    setGs1LotRandomize(feed?.gs1LotRandomize !== false);
    setGs1LotGranularity((feed?.gs1LotGranularity as "DAY" | "HALF_DAY") ?? "DAY");
    setGs1LotCode(feed?.gs1LotCode ?? "");
    setGs1DateField((feed?.gs1DateField as "expirationDate" | "bestBeforeDate") ?? "expirationDate");
    // No clean inverse from days back to a weeks/months selection — always
    // show the loaded value in days, unit reset to "days" (per design).
    setShelfLifeValue(feed?.gs1ShelfLifeDays ?? 30);
    setShelfLifeUnit("days");
    setGs1DigitalLinkBaseUrl(feed?.gs1DigitalLinkBaseUrl || "https://id.gs1.org");

    setError(null);
  }, [feed]);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => setSites((d.locations ?? []).map((l: SiteOption) => ({ code: l.code, name: l.name }))))
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    if (!locationCode) {
      setZones([]);
      return;
    }
    fetch(`/api/locations/${encodeURIComponent(locationCode)}/zones`)
      .then((r) => (r.ok ? r.json() : { zones: [] }))
      .then((d) =>
        setZones(
          (d.zones ?? [])
            .filter((z: { code?: string }) => z.code)
            .map((z: { code: string; name?: string }) => ({ code: z.code, name: z.name || z.code }))
        )
      )
      .catch(() => setZones([]));
  }, [locationCode]);

  const isGtinBased = GTIN_STANDARDS.has(gs1Standard);
  const isDsgtin = DSGTIN_STANDARDS.has(gs1Standard);
  const showGtinPicker = (kind === "NEW" && isGtinBased) || (kind === "PRESENT" && presentMatchMode === "GTIN_LIST");

  function handleStandardChange(next: string) {
    setGs1Standard(next);
    // Re-default the filter to this standard's recommended value — simple
    // "re-default on standard change" posture, a manual edit followed by a
    // standard change re-defaults too (documented tradeoff, BL-089).
    setGs1Filter(GS1_FILTER_DEFAULTS[next as keyof typeof GS1_FILTER_DEFAULTS] ?? 3);
    // Reset the Digital Link base URL only when leaving DSGTIN entirely —
    // switching dsgtin-plus <-> dsgtin-plus-plus keeps whatever the user
    // already typed (BL-089b: both standards use this field now).
    if (!DSGTIN_STANDARDS.has(next)) setGs1DigitalLinkBaseUrl("https://id.gs1.org");
  }

  async function handleSave() {
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = { name: name.trim(), kind };
    if (kind === "FIXED") {
      body.fixedItems = fixedItems.map((s) => s.trim()).filter(Boolean);
    } else if (kind === "PRESENT") {
      body.gtins = gtins;
      body.categoryCode = categoryCode;
      body.presentMatchMode = presentMatchMode;
      body.presentTakeAll = presentTakeAll;
      if (!presentTakeAll) body.quantityMax = quantityMax;
      body.locationCode = locationCode;
      body.zoneCode = zoneCode;
    } else {
      // NEW
      body.gs1Standard = gs1Standard;
      body.quantityMin = quantityMin;
      body.quantityMax = quantityMax;
      body.gs1Filter = gs1Filter;

      if (isGtinBased) {
        body.gtins = gtins;
        body.categoryCode = categoryCode;
      } else if (gs1Standard === "sscc-96") {
        body.companyPrefix = companyPrefix;
        body.extensionDigit = extensionDigit;
      } else if (gs1Standard === "grai-96") {
        body.companyPrefix = companyPrefix;
        body.assetType = assetType;
      } else if (gs1Standard === "giai-96") {
        body.companyPrefix = companyPrefix;
        body.itemReference = itemReference;
      } else if (gs1Standard === "gid-96") {
        body.generalManagerNumber = generalManagerNumber;
        body.objectClass = objectClass;
      }

      if (isDsgtin) {
        body.gs1DateField = gs1DateField;
        body.gs1ShelfLifeDays = Math.round(shelfLifeValue * SHELF_LIFE_FACTORS[shelfLifeUnit]);
        body.gs1LotMode = gs1LotMode;
        if (gs1LotMode === "FIXED") body.gs1LotCode = gs1LotCode;
        if (gs1LotMode === "AUTO") {
          body.gs1LotRandomize = gs1LotRandomize;
          body.gs1LotGranularity = gs1LotGranularity;
        }
        body.gs1DigitalLinkBaseUrl = gs1DigitalLinkBaseUrl; // both DSGTIN standards now (BL-089b)
      }
    }

    const res = feed
      ? await fetch(`/api/item-feeds/${feed.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/item-feeds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save this item feed.");
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved(data.itemFeed);
  }

  return (
    <>
      <div className="modal-body">
        {readOnly && (
          <div className="snack snack-info">Shared with you — read-only. You can inspect every field but not change it.</div>
        )}
        <fieldset className="modal-fields" disabled={readOnly}>
        {error && <div className="snack snack-danger">{error}</div>}
        {!readOnly && feed && (feed.usageCount ?? 0) > 0 && (
          <div className="snack snack-warning">
            This is a shared definition — editing it changes {feed.usageCount} placement
            {feed.usageCount === 1 ? "" : "s"} on workflow canvases, not just this one.
          </div>
        )}

        <div className="field-block">
          <label htmlFor="feedName">Name</label>
          <input id="feedName" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="field-block">
          <label>Kind</label>
          <div className="icon-toggle" role="group" aria-label="Item feed kind">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={`icon-toggle-btn${kind === k.value ? " selected" : ""}`}
                style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                onClick={() => setKind(k.value)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="note" style={{ marginTop: 6 }}>
            {KINDS.find((k) => k.value === kind)?.info}
          </p>
        </div>

        {kind === "PRESENT" && (
          <div className="field-block">
            <label>Match</label>
            <div className="icon-toggle" role="group" aria-label="Present match mode">
              <button
                type="button"
                className={`icon-toggle-btn${presentMatchMode === "GTIN_LIST" ? " selected" : ""}`}
                style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                onClick={() => setPresentMatchMode("GTIN_LIST")}
              >
                Specific GTINs
              </button>
              <button
                type="button"
                className={`icon-toggle-btn${presentMatchMode === "ALL" ? " selected" : ""}`}
                style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                onClick={() => setPresentMatchMode("ALL")}
              >
                Anything in the zone
              </button>
            </div>
          </div>
        )}

        {showGtinPicker && (
          <ProductPicker
            gtins={gtins}
            categoryCode={categoryCode}
            onChange={({ gtins: g, categoryCode: c }) => {
              setGtins(g);
              setCategoryCode(c);
            }}
          />
        )}

        {kind === "NEW" && (
          <div className="field-row">
            <div className="field-block">
              <label htmlFor="qMin">Quantity min</label>
              <input
                id="qMin"
                type="number"
                min={1}
                value={quantityMin}
                onChange={(e) => setQuantityMin(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="field-block">
              <label htmlFor="qMax">Quantity max</label>
              <input
                id="qMax"
                type="number"
                min={1}
                value={quantityMax}
                onChange={(e) => setQuantityMax(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
        )}
        {kind === "NEW" && quantityMax > 10 && (
          <div className="snack snack-warning">New feeds are capped at 10 minted items per firing (total across all GTINs).</div>
        )}

        {kind === "PRESENT" && (
          <div className="field-block">
            <label>How many each firing</label>
            <div className="icon-toggle" role="group" aria-label="Present quantity mode">
              <button
                type="button"
                className={`icon-toggle-btn${presentTakeAll ? " selected" : ""}`}
                style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                onClick={() => setPresentTakeAll(true)}
              >
                All items in stock
              </button>
              <button
                type="button"
                className={`icon-toggle-btn${!presentTakeAll ? " selected" : ""}`}
                style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                onClick={() => setPresentTakeAll(false)}
              >
                Up to a maximum
              </button>
            </div>
            {presentTakeAll ? (
              <p className="note" style={{ marginTop: 6 }}>
                Every firing pushes everything currently in stock in that zone.
              </p>
            ) : (
              <div className="field-block" style={{ marginTop: 8, maxWidth: 160 }}>
                <label htmlFor="qMax">Maximum</label>
                <input
                  id="qMax"
                  type="number"
                  min={1}
                  value={quantityMax}
                  onChange={(e) => setQuantityMax(Math.max(1, Number(e.target.value) || 1))}
                />
                <span className="note" style={{ marginTop: 4 }}>
                  A random subset of that size, or fewer if the zone holds less.
                </span>
              </div>
            )}
          </div>
        )}

        {kind === "NEW" && (
          <div className="field-block">
            <label htmlFor="feedGs1Standard">Identifier format</label>
            <select id="feedGs1Standard" value={gs1Standard} onChange={(e) => handleStandardChange(e.target.value)}>
              <optgroup label="GTIN-based">
                {GTIN_STANDARD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Not GTIN-based">
                {NON_GTIN_STANDARD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="note" style={{ marginTop: 4 }}>
              {ALL_STANDARD_OPTIONS.find((o) => o.value === gs1Standard)?.info}
            </span>
          </div>
        )}

        {kind === "NEW" && !isGtinBased && (
          <div className="field-row">
            {(gs1Standard === "sscc-96" || gs1Standard === "grai-96" || gs1Standard === "giai-96") && (
              <div className="field-block">
                <label htmlFor="companyPrefix">Company prefix</label>
                <input
                  id="companyPrefix"
                  type="text"
                  placeholder="6-12 digits"
                  value={companyPrefix}
                  onChange={(e) => setCompanyPrefix(e.target.value)}
                />
              </div>
            )}
            {gs1Standard === "sscc-96" && (
              <div className="field-block" style={{ maxWidth: 140 }}>
                <label htmlFor="extensionDigit">Extension digit</label>
                <input
                  id="extensionDigit"
                  type="text"
                  maxLength={1}
                  value={extensionDigit}
                  onChange={(e) => setExtensionDigit(e.target.value.replace(/\D/g, "").slice(0, 1) || "0")}
                />
              </div>
            )}
            {gs1Standard === "grai-96" && (
              <div className="field-block">
                <label htmlFor="assetType">Asset type</label>
                <input id="assetType" type="text" value={assetType} onChange={(e) => setAssetType(e.target.value)} />
              </div>
            )}
            {gs1Standard === "giai-96" && (
              <div className="field-block">
                <label htmlFor="itemReference">Individual asset reference</label>
                <input
                  id="itemReference"
                  type="text"
                  value={itemReference}
                  onChange={(e) => setItemReference(e.target.value)}
                />
              </div>
            )}
            {gs1Standard === "gid-96" && (
              <>
                <div className="field-block">
                  <label htmlFor="generalManagerNumber">General manager number</label>
                  <input
                    id="generalManagerNumber"
                    type="text"
                    value={generalManagerNumber}
                    onChange={(e) => setGeneralManagerNumber(e.target.value)}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="objectClass">Object class</label>
                  <input id="objectClass" type="text" value={objectClass} onChange={(e) => setObjectClass(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        {kind === "NEW" && (
          <div className="field-block" style={{ maxWidth: 140 }}>
            <label htmlFor="gs1Filter">Filter</label>
            <input
              id="gs1Filter"
              type="number"
              min={0}
              max={7}
              value={gs1Filter}
              onChange={(e) => setGs1Filter(Math.max(0, Math.min(7, Number(e.target.value) || 0)))}
            />
            <span className="note" style={{ marginTop: 4 }}>
              GS1 EPC filter value (0–7), recommended {GS1_FILTER_DEFAULTS[gs1Standard as keyof typeof GS1_FILTER_DEFAULTS] ?? 3}{" "}
              for this standard — editable.
              {gs1Standard === "gid-96" && " GID-96's recommended value isn't documented by the platform; treat as unconfirmed."}
            </span>
          </div>
        )}

        {kind === "NEW" && isDsgtin && (
          <>
            <div className="field-block">
              <label>Date type</label>
              <div className="icon-toggle" role="group" aria-label="Prioritized date type">
                <button
                  type="button"
                  className={`icon-toggle-btn${gs1DateField === "expirationDate" ? " selected" : ""}`}
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                  onClick={() => setGs1DateField("expirationDate")}
                >
                  Expiration date
                </button>
                <button
                  type="button"
                  className={`icon-toggle-btn${gs1DateField === "bestBeforeDate" ? " selected" : ""}`}
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                  onClick={() => setGs1DateField("bestBeforeDate")}
                >
                  Best-before date
                </button>
              </div>
            </div>

            <div className="field-row">
              <div className="field-block" style={{ maxWidth: 140 }}>
                <label htmlFor="shelfLifeValue">Shelf-life period</label>
                <input
                  id="shelfLifeValue"
                  type="number"
                  min={0}
                  value={shelfLifeValue}
                  onChange={(e) => setShelfLifeValue(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div className="field-block" style={{ maxWidth: 140 }}>
                <label htmlFor="shelfLifeUnit">Unit</label>
                <select
                  id="shelfLifeUnit"
                  value={shelfLifeUnit}
                  onChange={(e) => setShelfLifeUnit(e.target.value as ShelfLifeUnit)}
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                </select>
              </div>
            </div>
            <p className="note" style={{ marginTop: -6, marginBottom: 6 }}>
              The actual date is computed fresh every time this feed fires (today + this period), never fixed when
              you save.
            </p>

            <div className="field-block">
              <label>Lot code</label>
              <div className="icon-toggle" role="group" aria-label="Lot code mode">
                <button
                  type="button"
                  className={`icon-toggle-btn${gs1LotMode === "NONE" ? " selected" : ""}`}
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                  onClick={() => setGs1LotMode("NONE")}
                >
                  None
                </button>
                <button
                  type="button"
                  className={`icon-toggle-btn${gs1LotMode === "AUTO" ? " selected" : ""}`}
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                  onClick={() => setGs1LotMode("AUTO")}
                >
                  Auto-generate
                </button>
                <button
                  type="button"
                  className={`icon-toggle-btn${gs1LotMode === "FIXED" ? " selected" : ""}`}
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                  onClick={() => setGs1LotMode("FIXED")}
                >
                  Fixed
                </button>
              </div>
              {gs1LotMode === "NONE" && <p className="note" style={{ marginTop: 6 }}>No lot code is sent — it's optional on the platform.</p>}
              {gs1LotMode === "AUTO" && (
                <div style={{ marginTop: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={gs1LotRandomize}
                      onChange={(e) => setGs1LotRandomize(e.target.checked)}
                    />
                    Include random suffix
                  </label>
                  {gs1LotRandomize ? (
                    <p className="note" style={{ marginTop: 6 }}>
                      A fresh lot code (e.g. L250917-K3M — date + a random suffix) is generated every time this feed
                      fires.
                    </p>
                  ) : (
                    <>
                      <div className="field-block" style={{ marginTop: 8 }}>
                        <label htmlFor="gs1LotGranularity">Changes</label>
                        <select
                          id="gs1LotGranularity"
                          value={gs1LotGranularity}
                          onChange={(e) => setGs1LotGranularity(e.target.value as "DAY" | "HALF_DAY")}
                        >
                          <option value="DAY">Once per day</option>
                          <option value="HALF_DAY">Once per half-day</option>
                        </select>
                      </div>
                      <p className="note" style={{ marginTop: 6 }}>
                        {gs1LotGranularity === "DAY"
                          ? "Every firing on the same calendar day sends the same lot code (e.g. L250917)."
                          : "The lot code changes once at midday (server clock) — e.g. L250917-AM, then L250917-PM after noon."}
                      </p>
                    </>
                  )}
                </div>
              )}
              {gs1LotMode === "FIXED" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <input
                    type="text"
                    maxLength={20}
                    placeholder="e.g. L250917-K3M"
                    value={gs1LotCode}
                    onChange={(e) => setGs1LotCode(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-secondary small" onClick={() => setGs1LotCode(generateLotCode())}>
                    Suggest
                  </button>
                </div>
              )}
            </div>

            {isDsgtin && (
              <div className="field-block">
                <label htmlFor="gs1DigitalLinkBaseUrl">Digital Link base URL</label>
                <input
                  id="gs1DigitalLinkBaseUrl"
                  type="text"
                  value={gs1DigitalLinkBaseUrl}
                  onChange={(e) => setGs1DigitalLinkBaseUrl(e.target.value)}
                />
                <span className="note" style={{ marginTop: 4 }}>
                  {gs1Standard === "dsgtin-plus-plus"
                    ? "This standard embeds the domain directly into the identifier."
                    : "Used to build this item's resolvable Digital Link."}
                </span>
              </div>
            )}
          </>
        )}

        {kind === "PRESENT" && (
          <div className="field-row">
            <div className="field-block">
              <label htmlFor="feedSite">Site</label>
              <select
                id="feedSite"
                value={locationCode}
                onChange={(e) => {
                  setLocationCode(e.target.value);
                  setZoneCode("");
                }}
              >
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-block">
              <label htmlFor="feedZone">Zone</label>
              <select id="feedZone" value={zoneCode} onChange={(e) => setZoneCode(e.target.value)} disabled={!locationCode}>
                <option value="">Select a zone…</option>
                {zones.map((z) => (
                  <option key={z.code} value={z.code}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {kind === "FIXED" && (
          <div className="field-block">
            <label>Items (EPC hex or URN)</label>
            {fixedItems.map((item, i) => (
              <div className="attr-row" key={i}>
                <input
                  type="text"
                  placeholder="3034DF97… or urn:epc:id:sgtin:…"
                  value={item}
                  onChange={(e) => setFixedItems((rows) => rows.map((r, j) => (j === i ? e.target.value : r)))}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="attr-remove-btn"
                  aria-label="Remove item"
                  disabled={fixedItems.length <= 1}
                  onClick={() => setFixedItems((rows) => rows.filter((_, j) => j !== i))}
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <line x1="5" y1="5" x2="15" y2="15" />
                    <line x1="15" y1="5" x2="5" y2="15" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" className="attr-add-link" onClick={() => setFixedItems((rows) => [...rows, ""])}>
              + Add item
            </button>
          </div>
        )}
        </fieldset>
      </div>

      <div className="modal-foot">
        {readOnly ? (
          <button className="btn btn-secondary" onClick={onCancel}>
            Close
          </button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
