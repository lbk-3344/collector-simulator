"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialog } from "@/components/AppDialog";
import type { ItemFeedRecord } from "@/lib/itemFeed";
import { ItemFeedModal } from "./ItemFeedModal";

// Item Feed library (BL-058, CLAUDE-CONCEPT.md 16.1) — reusable batch-of-items
// definitions, attachable to any Task's Channel input on the Part 2 canvas.

const KIND_LABEL: Record<string, string> = { NEW: "New", PRESENT: "Present", FIXED: "Fixed" };
const KIND_CHIP: Record<string, string> = { NEW: "chip-success", PRESENT: "chip-info", FIXED: "chip-warning" };

function summarize(f: ItemFeedRecord): string {
  if (f.kind === "FIXED") return `${f.fixedItems?.length ?? 0} fixed item${(f.fixedItems?.length ?? 0) === 1 ? "" : "s"}`;
  const product = f.gtin ? `GTIN ${f.gtin}` : f.categoryCode ? `category ${f.categoryCode}` : "no product";
  const qty = f.quantityMin === f.quantityMax ? `${f.quantityMin}` : `${f.quantityMin}–${f.quantityMax}`;
  const where = f.kind === "PRESENT" ? ` · ${f.locationCode}/${f.zoneCode}` : "";
  return `${product} · qty ${qty}${where}`;
}

export default function ItemFeedsPage() {
  const [feeds, setFeeds] = useState<ItemFeedRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ feed: ItemFeedRecord | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm } = useDialog();

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/item-feeds");
    if (!res.ok) {
      setError("Couldn't load item feeds.");
      return;
    }
    setFeeds((await res.json()).itemFeeds ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(feed: ItemFeedRecord) {
    const ok = await confirm({
      variant: "warning",
      title: "Delete item feed",
      message:
        (feed.usageCount ?? 0) > 0
          ? `"${feed.name}" is used by ${feed.usageCount} task channel${feed.usageCount === 1 ? "" : "s"} — deleting it will fail until it's detached there.`
          : `Delete "${feed.name}"? This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(feed.id);
    const res = await fetch(`/api/item-feeds/${feed.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't delete this item feed.");
    }
    await load();
    setBusyId(null);
  }

  return (
    <section className="fade-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Item Feeds
        </h1>
        <button className="btn btn-primary" onClick={() => setModal({ feed: null })}>
          + New item feed
        </button>
      </div>

      {error && <div className="snack snack-danger">{error}</div>}

      {!feeds ? (
        <p className="note">Loading item feeds…</p>
      ) : feeds.length === 0 ? (
        <p className="note">
          No item feeds yet. An item feed is a reusable batch of items — new (minted), present (pulled from a zone), or a
          fixed list — that a workflow task fires on its channel.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Definition</th>
                <th>Used by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => (
                <tr key={feed.id}>
                  <td>
                    <div className="u-name">{feed.name}</div>
                  </td>
                  <td>
                    <span className={`chip ${KIND_CHIP[feed.kind]}`}>{KIND_LABEL[feed.kind]}</span>
                  </td>
                  <td className="u-meta">{summarize(feed)}</td>
                  <td className="u-meta">{feed.usageCount ?? 0}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="row-icon-btn row-icon-btn-edit"
                        aria-label="Edit"
                        title="Edit"
                        onClick={() => setModal({ feed })}
                      >
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13.3 3.5a1.9 1.9 0 0 1 2.7 2.7L7 15.2l-3.7 1 1-3.7 9-9Z" />
                        </svg>
                      </button>
                      <button
                        className="row-icon-btn row-icon-btn-delete"
                        aria-label="Delete"
                        title="Delete"
                        disabled={busyId === feed.id}
                        onClick={() => handleDelete(feed)}
                      >
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M5.5 6 6.2 16a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6M8.3 9v5M11.7 9v5" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ItemFeedModal
        open={Boolean(modal)}
        feed={modal?.feed ?? null}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          load();
        }}
      />
    </section>
  );
}
