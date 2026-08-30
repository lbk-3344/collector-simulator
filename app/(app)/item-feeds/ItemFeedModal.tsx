"use client";

import { useEffect, useState } from "react";
import { ProductPicker } from "@/components/ProductPicker";
import type { ItemFeedKind, ItemFeedRecord } from "@/lib/itemFeed";

interface SiteOption {
  code: string;
  name: string;
}
interface ZoneOption {
  code: string;
  name: string;
}

const KINDS: { value: ItemFeedKind; label: string; hint: string }[] = [
  { value: "NEW", label: "New", hint: "Mints fresh EPCs each firing (capped at 10)." },
  { value: "PRESENT", label: "Present", hint: "Pulls existing items from a site + zone." },
  { value: "FIXED", label: "Fixed", hint: "Fires the exact same explicit list every time." },
];

export function ItemFeedModal({
  open,
  feed,
  onClose,
  onSaved,
}: {
  open: boolean;
  feed: ItemFeedRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ItemFeedKind>("NEW");
  const [gtin, setGtin] = useState<string | null>(null);
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
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
    if (!open) return;
    setName(feed?.name ?? "");
    setKind(feed?.kind ?? "NEW");
    setGtin(feed?.gtin ?? null);
    setCategoryCode(feed?.categoryCode ?? null);
    setQuantityMin(feed?.quantityMin ?? 1);
    setQuantityMax(feed?.quantityMax ?? feed?.quantityMin ?? 1);
    setLocationCode(feed?.locationCode ?? "");
    setZoneCode(feed?.zoneCode ?? "");
    setFixedItems(feed?.fixedItems?.length ? feed.fixedItems : [""]);
    setError(null);
  }, [open, feed]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => setSites((d.locations ?? []).map((l: SiteOption) => ({ code: l.code, name: l.name }))))
      .catch(() => setSites([]));
  }, [open]);

  useEffect(() => {
    if (!open || !locationCode) {
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
  }, [open, locationCode]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSave() {
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = { name: name.trim(), kind };
    if (kind === "FIXED") {
      body.fixedItems = fixedItems.map((s) => s.trim()).filter(Boolean);
    } else {
      body.gtin = gtin;
      body.categoryCode = categoryCode;
      body.quantityMin = quantityMin;
      body.quantityMax = quantityMax;
      if (kind === "PRESENT") {
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

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't save this item feed.");
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="itemFeedTitle" style={{ width: 520 }}>
        <div className="modal-head">
          <h2 id="itemFeedTitle">{feed ? "Edit item feed" : "New item feed"}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="snack snack-danger">{error}</div>}

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
            <span className="note" style={{ marginTop: 4 }}>
              {KINDS.find((k) => k.value === kind)?.hint}
            </span>
          </div>

          {kind !== "FIXED" && (
            <>
              <ProductPicker
                value={{ gtin, categoryCode }}
                onChange={(sel) => {
                  setGtin(sel.gtin);
                  setCategoryCode(sel.categoryCode);
                }}
              />
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
              {kind === "NEW" && (quantityMax > 10 || quantityMin > 10) && (
                <div className="snack snack-warning">New feeds are capped at 10 minted items per firing.</div>
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
        </div>

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
