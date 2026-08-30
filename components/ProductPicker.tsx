"use client";

import { useEffect, useMemo, useState } from "react";
import type { BartenderProduct, BartenderCategory } from "@/lib/bartenderProducts";

// Reusable product / category picker for the Item Feed form (BL-055). The
// legacy Product API has no server-side search (7.7), so this fetches the
// full list once and filters client-side by label / GTIN, optionally scoped
// to a category.

function productLabel(p: BartenderProduct): string {
  return p.productLabelShort || p.productLabelLong || p.productCode || p.gtin;
}

export interface ProductSelection {
  gtin: string | null;
  categoryCode: string | null;
  label: string;
}

export function ProductPicker({
  value,
  onChange,
}: {
  value: { gtin: string | null; categoryCode: string | null };
  onChange: (sel: ProductSelection) => void;
}) {
  const [products, setProducts] = useState<BartenderProduct[] | null>(null);
  const [categories, setCategories] = useState<BartenderCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryCode, setCategoryCode] = useState(value.categoryCode ?? "");

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

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !categoryCode || p.categoryLevel1Code === categoryCode || p.categoryParent === categoryCode)
      .filter((p) => !q || productLabel(p).toLowerCase().includes(q) || p.gtin.includes(q))
      .slice(0, 200);
  }, [products, query, categoryCode]);

  const selected = products?.find((p) => p.gtin === value.gtin) ?? null;

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
            value={categoryCode}
            onChange={(e) => {
              setCategoryCode(e.target.value);
              onChange({ gtin: value.gtin, categoryCode: e.target.value || null, label: selected ? productLabel(selected) : "" });
            }}
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

      {value.gtin && selected && (
        <div className="snack snack-success" style={{ display: "flex" }}>
          Selected: {productLabel(selected)} · {selected.gtin}
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
              className={`product-picker-item${p.gtin === value.gtin ? " selected" : ""}`}
              onClick={() =>
                onChange({ gtin: p.gtin, categoryCode: categoryCode || null, label: productLabel(p) })
              }
            >
              <span className="product-picker-item-label">{productLabel(p)}</span>
              <span className="product-picker-item-gtin">{p.gtin}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
