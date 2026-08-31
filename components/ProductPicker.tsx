"use client";

import { useEffect, useMemo, useState } from "react";
import type { BartenderProduct, BartenderCategory } from "@/lib/bartenderProducts";

// Reusable multi-select product / category picker for the Item Feed form
// (BL-055, revised 2026-08-30 — a Feed can list several GTINs). The legacy
// Product API has no server-side search (7.7), so this fetches the full list
// once and filters client-side by label / GTIN, optionally scoped to a
// category.

function productLabel(p: BartenderProduct): string {
  return p.productLabelShort || p.productLabelLong || p.productCode || p.gtin;
}

export function ProductPicker({
  gtins,
  categoryCode,
  onChange,
}: {
  gtins: string[];
  categoryCode: string | null;
  onChange: (next: { gtins: string[]; categoryCode: string | null }) => void;
}) {
  const [products, setProducts] = useState<BartenderProduct[] | null>(null);
  const [categories, setCategories] = useState<BartenderCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([p, c]) => {
        if (cancelled) return;
        if (p?.error) setError(p.error);
        setProducts(p?.products ?? []);
        setCategories(c?.categories ?? []);
      })
      .catch(() => !cancelled && setError("Couldn't load products — check the Track & Trace login in Settings."));
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = new Set(gtins);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !categoryCode || p.categoryLevel1Code === categoryCode || p.categoryParent === categoryCode)
      .filter((p) => !q || productLabel(p).toLowerCase().includes(q) || p.gtin.includes(q))
      .slice(0, 250);
  }, [products, query, categoryCode]);

  const labelFor = (gtin: string) => products?.find((p) => p.gtin === gtin);

  function toggle(gtin: string) {
    const next = new Set(selected);
    if (next.has(gtin)) next.delete(gtin);
    else next.add(gtin);
    onChange({ gtins: [...next], categoryCode });
  }

  function addWholeCategory() {
    if (!categoryCode || !products) return;
    const next = new Set(selected);
    for (const p of products) {
      if (p.categoryLevel1Code === categoryCode || p.categoryParent === categoryCode) next.add(p.gtin);
    }
    onChange({ gtins: [...next], categoryCode });
  }

  return (
    <div className="product-picker">
      {error && <div className="snack snack-danger">{error}</div>}

      <div className="field-row">
        <div className="field-block" style={{ flex: 2 }}>
          <label>Search product</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="name or GTIN…"
            disabled={!products}
          />
        </div>
        <div className="field-block" style={{ flex: 1 }}>
          <label>Category</label>
          <select
            value={categoryCode ?? ""}
            onChange={(e) => onChange({ gtins, categoryCode: e.target.value || null })}
          >
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.categoryName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {categoryCode && (
        <button type="button" className="attr-add-link" onClick={addWholeCategory}>
          + Add every product in this category
        </button>
      )}

      {gtins.length > 0 && (
        <div className="product-picker-chips">
          {gtins.map((g) => (
            <span key={g} className="chip chip-brand" role="button" tabIndex={0} onClick={() => toggle(g)} title="Remove">
              {labelFor(g) ? productLabel(labelFor(g)!) : g} ✕
            </span>
          ))}
        </div>
      )}

      <div className="product-picker-list">
        {!products ? (
          <p className="note" style={{ marginTop: 8 }}>
            Loading products…
          </p>
        ) : filtered.length === 0 ? (
          <p className="note" style={{ marginTop: 8 }}>
            No matching products.
          </p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.gtin}
              type="button"
              className={`product-picker-item${selected.has(p.gtin) ? " selected" : ""}`}
              onClick={() => toggle(p.gtin)}
            >
              <span className="product-picker-item-label">
                {selected.has(p.gtin) ? "✓ " : ""}
                {productLabel(p)}
              </span>
              <span className="product-picker-item-gtin">{p.gtin}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
