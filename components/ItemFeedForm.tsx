"use client";

import { useEffect, useState } from "react";
import { ProductPicker } from "@/components/ProductPicker";
import type { ItemFeedKind, ItemFeedRecord, PresentMatchMode } from "@/lib/itemFeed";

interface SiteOption {
  code: string;
  name: string;
}
interface ZoneOption {
  code: string;
  name: string;
}

const KINDS: { value: ItemFeedKind; label: string; info: string }[] = [
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

// Standalone Item Feed create/edit form (BL-058 revised) — kind-branching
// with per-kind info text, multi-GTIN, PRESENT GTIN-list vs ALL. Reused by
// the Item Feeds library page and (Part 2) the canvas "+ New Feed" flow.
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
  const [quantityMin, setQuantityMin] = useState(1);
  const [quantityMax, setQuantityMax] = useState(1);
  const [locationCode, setLocationCode] = useState("");
  const [zoneCode, setZoneCode] = useState("");
  const [fixedItems, setFixedItems] = useState<string[]>([""]);

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
    setQuantityMin(feed?.quantityMin ?? 1);
    setQuantityMax(feed?.quantityMax ?? feed?.quantityMin ?? 1);
    setLocationCode(feed?.locationCode ?? "");
    setZoneCode(feed?.zoneCode ?? "");
    setFixedItems(feed?.fixedItems?.length ? feed.fixedItems : [""]);
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

  const showGtinPicker = kind === "NEW" || (kind === "PRESENT" && presentMatchMode === "GTIN_LIST");

  async function handleSave() {
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = { name: name.trim(), kind };
    if (kind === "FIXED") {
      body.fixedItems = fixedItems.map((s) => s.trim()).filter(Boolean);
    } else {
      body.gtins = gtins;
      body.categoryCode = categoryCode;
      body.quantityMin = quantityMin;
      body.quantityMax = quantityMax;
      if (kind === "PRESENT") {
        body.presentMatchMode = presentMatchMode;
        body.locationCode = locationCode;
        body.zoneCode = zoneCode;
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

        {kind !== "FIXED" && (
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
