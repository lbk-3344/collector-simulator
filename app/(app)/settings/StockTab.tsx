"use client";

import { useEffect, useState } from "react";

// Per-user stock settings — open to every signed-in role. Backed by
// GET/POST /api/settings/stock.
export function StockTab() {
  const [loaded, setLoaded] = useState(false);
  const [days, setDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    fetch("/api/settings/stock", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setDays(String(d.inStockWindowDays));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaveOk(false);
    const res = await fetch("/api/settings/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inStockWindowDays: Number(days) }),
    });
    setSaving(false);
    if (res.ok) setSaveOk(true);
    else setError((await res.json().catch(() => null))?.error ?? "Could not save.");
  }

  if (!loaded) return <p className="note">Loading stock settings…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 440 }}>
      {error && <div className="snack snack-danger">{error}</div>}

      <div className="field-block">
        <label>In Stock Window (days)</label>
        <input
          type="number"
          min={1}
          step={1}
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setSaveOk(false);
          }}
        />
        <p className="note">
          An item counts as <strong>in stock</strong> only if its most recent event on the platform happened within
          this many days. Items last seen longer ago are treated as gone. It applies to every In stock feed — manual
          or automated — and defaults to 30 days.
        </p>
      </div>

      <div className="row" style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {saveOk && <div className="snack snack-success">Saved.</div>}
    </div>
  );
}
