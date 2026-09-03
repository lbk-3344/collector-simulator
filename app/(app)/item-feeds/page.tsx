"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDialog } from "@/components/AppDialog";
import { PageHeader } from "@/components/PageHeader";
import { SharedBadge } from "@/components/SharedBadge";
import { useTableSort } from "@/lib/useTableSort";
import type { ItemFeedRecord } from "@/lib/itemFeed";
import type { BartenderLocation } from "@/lib/bartenderLocations";
import { ItemFeedModal } from "./ItemFeedModal";

// Item Feed library (BL-058, CLAUDE-CONCEPT.md 16.1) — reusable batch-of-items
// definitions, attachable to any Task's Channel input on the Part 2 canvas.

// "In stock" is the user-facing label for the PRESENT kind (BUG #cmth5k10o).
// The enum value stays PRESENT everywhere in code/DB/docs.
function DuplicateIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

const KIND_LABEL: Record<string, string> = { NEW: "New", PRESENT: "In stock", FIXED: "Fixed" };
const KIND_CHIP: Record<string, string> = { NEW: "chip-success", PRESENT: "chip-info", FIXED: "chip-warning" };

const ITEM_FEEDS_INFO = (
  <>
    <p>
      An <strong>item feed</strong> is a reusable definition of a batch of items that a workflow task fires onto one of
      its channels while the workflow runs.
    </p>
    <p>
      <strong>New</strong> mints brand-new serialized items on the Bartender Track &amp; Trace platform (real and
      permanent, capped at 10 per firing). <strong>In stock</strong> pulls whatever is actually recorded as present in a
      site + zone right now. <strong>Fixed</strong> sends the same explicit EPC/URN list every time.
    </p>
    <p>Define a feed once here, then drop it onto any workflow canvas as one or more feed nodes.</p>
  </>
);

function summarize(f: ItemFeedRecord): string {
  if (f.kind === "FIXED") return `${f.fixedItems?.length ?? 0} fixed item${(f.fixedItems?.length ?? 0) === 1 ? "" : "s"}`;
  const n = f.gtins?.length ?? 0;
  const product =
    f.kind === "PRESENT" && f.presentMatchMode === "ALL"
      ? "any GTIN in zone"
      : n === 1
        ? `GTIN ${f.gtins![0]}`
        : n > 1
          ? `${n} GTINs`
          : "no product";
  const qty =
    f.kind === "PRESENT"
      ? f.presentTakeAll
        ? "all in stock"
        : `up to ${f.quantityMax}`
      : f.quantityMin === f.quantityMax
        ? `${f.quantityMin}`
        : `${f.quantityMin}–${f.quantityMax}`;
  const where = f.kind === "PRESENT" ? ` · ${f.locationCode}/${f.zoneCode}` : "";
  return `${product} · qty ${qty}${where}`;
}

// A feed's site: PRESENT feeds are pinned to one site; NEW / FIXED apply
// anywhere (BUG #12).
const ALL_SITES = "All sites";

export default function ItemFeedsPage() {
  const [feeds, setFeeds] = useState<ItemFeedRecord[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [locations, setLocations] = useState<BartenderLocation[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>(""); // "" = all (BUG #15)
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ feed: ItemFeedRecord | null; readOnly?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm } = useDialog();

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/item-feeds");
    if (!res.ok) {
      setError("Couldn't load item feeds.");
      return;
    }
    const data = await res.json();
    setFeeds(data.itemFeeds ?? []);
    setCurrentUserId(data.currentUserId ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => setLocations(d.locations ?? []))
      .catch(() => {});
    fetch("/api/settings/selected-location")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.locationCode && setSiteFilter(d.locationCode))
      .catch(() => {});
  }, []);

  const siteName = useCallback(
    (code: string) => locations.find((l) => l.code === code)?.name ?? code,
    [locations]
  );
  // The site label shown per row.
  const feedSiteLabel = useCallback(
    (f: ItemFeedRecord) => (f.kind === "PRESENT" && f.locationCode ? siteName(f.locationCode) : ALL_SITES),
    [siteName]
  );

  const filterSites = useMemo(() => {
    const codes = Array.from(
      new Set((feeds ?? []).filter((f) => f.kind === "PRESENT" && f.locationCode).map((f) => f.locationCode as string))
    );
    return codes.map((c) => ({ code: c, name: siteName(c) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [feeds, siteName]);

  // A specific site shows its PRESENT feeds plus every NEW / FIXED feed
  // (those apply to all sites).
  const visible = useMemo(
    () =>
      (feeds ?? []).filter(
        (f) => !siteFilter || f.kind !== "PRESENT" || f.locationCode === siteFilter
      ),
    [feeds, siteFilter]
  );

  const { rows, headerProps } = useTableSort(
    visible,
    {
      name: (f) => f.name.toLowerCase(),
      kind: (f) => KIND_LABEL[f.kind],
      site: (f) => feedSiteLabel(f).toLowerCase(),
      usage: (f) => f.usageCount ?? 0,
    },
    { key: "name" }
  );

  async function handleDelete(feed: ItemFeedRecord) {
    const ok = await confirm({
      variant: "warning",
      title: "Delete item feed",
      message:
        (feed.usageCount ?? 0) > 0
          ? `"${feed.name}" is placed on ${feed.usageCount} workflow canvas${feed.usageCount === 1 ? "" : "es"}. Deleting it removes those placements too. Continue?`
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

  // Clone via POST /api/item-feeds/[id]/duplicate (BL-071) — a fresh,
  // independent ItemFeed row; no modal, the clone appears on the next reload.
  async function handleDuplicate(feed: ItemFeedRecord) {
    setBusyId(feed.id);
    setError(null);
    const res = await fetch(`/api/item-feeds/${feed.id}/duplicate`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't duplicate this item feed.");
    }
    await load();
    setBusyId(null);
  }

  return (
    <section className="fade-in">
      <PageHeader
        title="Item Feeds"
        info={ITEM_FEEDS_INFO}
        action={
          <button className="btn btn-primary" onClick={() => setModal({ feed: null })}>
            + New item feed
          </button>
        }
      />

      {error && <div className="snack snack-danger">{error}</div>}

      {feeds && feeds.length > 0 && filterSites.length > 0 && (
        <div className="list-toolbar">
          <label htmlFor="feedSiteFilter">Site</label>
          <select id="feedSiteFilter" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">All sites</option>
            {filterSites.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!feeds ? (
        <p className="note">Loading item feeds…</p>
      ) : feeds.length === 0 ? (
        <p className="note">
          No item feeds yet. An item feed is a reusable batch of items — new (minted), in stock (pulled from a zone), or a
          fixed list — that a workflow task fires on its channel.
        </p>
      ) : rows.length === 0 ? (
        <p className="note">No item feeds for {siteName(siteFilter)}.</p>
      ) : (
        <div className="panel table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th {...headerProps("name")}>Name</th>
                <th {...headerProps("kind")}>Kind</th>
                <th {...headerProps("site")}>Site</th>
                <th>Definition</th>
                <th {...headerProps("usage")}>Used by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((feed) => {
                const readOnly = currentUserId != null && feed.ownerId !== currentUserId;
                return (
                <tr key={feed.id}>
                  <td>
                    <div className="u-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {feed.name}
                      {readOnly && <SharedBadge />}
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${KIND_CHIP[feed.kind]}`}>{KIND_LABEL[feed.kind]}</span>
                  </td>
                  <td className="u-meta">{feedSiteLabel(feed)}</td>
                  <td className="u-meta">{summarize(feed)}</td>
                  <td className="u-meta">{feed.usageCount ?? 0}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="row-icon-btn row-icon-btn-edit"
                        aria-label={readOnly ? "View" : "Edit"}
                        title={readOnly ? "View (shared — read-only)" : "Edit"}
                        onClick={() => setModal({ feed, readOnly })}
                      >
                        {readOnly ? (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" />
                            <circle cx="10" cy="10" r="2.5" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13.3 3.5a1.9 1.9 0 0 1 2.7 2.7L7 15.2l-3.7 1 1-3.7 9-9Z" />
                          </svg>
                        )}
                      </button>
                      <button
                        className="row-icon-btn row-icon-btn-ghost"
                        aria-label="Duplicate"
                        title={readOnly ? "Shared with you — read-only" : "Duplicate"}
                        disabled={busyId === feed.id || readOnly}
                        onClick={() => handleDuplicate(feed)}
                      >
                        <DuplicateIcon />
                      </button>
                      <button
                        className="row-icon-btn row-icon-btn-delete"
                        aria-label="Delete"
                        title={readOnly ? "Shared with you — read-only" : "Delete"}
                        disabled={busyId === feed.id || readOnly}
                        onClick={() => handleDelete(feed)}
                      >
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M5.5 6 6.2 16a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6M8.3 9v5M11.7 9v5" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ItemFeedModal
        open={Boolean(modal)}
        feed={modal?.feed ?? null}
        readOnly={modal?.readOnly ?? false}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          load();
        }}
      />
    </section>
  );
}
