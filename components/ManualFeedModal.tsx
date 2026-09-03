"use client";

import { useEffect, useState } from "react";
import { ItemFeedForm, KINDS } from "@/components/ItemFeedForm";
import type { ItemFeedRecord } from "@/lib/itemFeed";
import type { DeviceRecord } from "@/lib/deviceConfig";

// Manual feed — one-off send from a Ready Device (BL-078, CLAUDE-CONCEPT.md
// §15.11). Pick one of your own Item Feeds (or duplicate / create one inline)
// and fire it once through a chosen Channel. Reuses the run engine's
// resolveBatch() + platform push server-side; does NOT fan out along Flow
// Links or write a SimulatedRead row. Stays open after a send so it can be
// fired again.
function DuplicateIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

const KIND_LABEL: Record<string, string> = { NEW: "New", PRESENT: "In stock", FIXED: "Fixed" };

function feedLine(f: ItemFeedRecord): string {
  if (f.kind === "FIXED") {
    const n = f.fixedItems?.length ?? 0;
    return `${n} fixed item${n === 1 ? "" : "s"}`;
  }
  const n = f.gtins?.length ?? 0;
  if (f.kind === "NEW") {
    const range = f.quantityMin === f.quantityMax ? `${f.quantityMin}` : `${f.quantityMin}–${f.quantityMax}`;
    return `${n} GTIN${n === 1 ? "" : "s"} · qty ${range}`;
  }
  // PRESENT
  const match = f.presentMatchMode === "ALL" ? "any GTIN" : `${n} GTIN${n === 1 ? "" : "s"}`;
  const qty = f.presentTakeAll ? "all in stock" : `up to ${f.quantityMax}`;
  return `${f.locationCode}/${f.zoneCode} · ${match} · ${qty}`;
}

export function ManualFeedModal({ device, onClose }: { device: DeviceRecord; onClose: () => void }) {
  const channels = device.channels ?? [];
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [feeds, setFeeds] = useState<ItemFeedRecord[] | null>(null);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "new">("list");
  const [dupBusyId, setDupBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ itemsResolved: number; pushed: boolean; note: string | null } | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const loadFeeds = () =>
    fetch("/api/item-feeds?mine=1")
      .then((r) => (r.ok ? r.json() : { itemFeeds: [] }))
      .then((d) => setFeeds(d.itemFeeds ?? []))
      .catch(() => setFeeds([]));

  useEffect(() => {
    loadFeeds();
  }, []);

  const selectedFeed = feeds?.find((f) => f.id === selectedFeedId) ?? null;

  async function handleDuplicate(id: string) {
    setDupBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/item-feeds/${id}/duplicate`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Couldn't duplicate this feed.");
      setFeeds((prev) => [data.itemFeed as ItemFeedRecord, ...(prev ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't duplicate this feed.");
    } finally {
      setDupBusyId(null);
    }
  }

  async function handleSend() {
    if (!channelId || !selectedFeedId) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/devices/${device.id}/manual-feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, itemFeedId: selectedFeedId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "The manual feed failed.");
      setResult({ itemsResolved: data.itemsResolved ?? 0, pushed: Boolean(data.pushed), note: data.note ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The manual feed failed.");
    } finally {
      setSending(false);
    }
  }

  const resultSnack = (() => {
    if (!result) return null;
    if (result.itemsResolved === 0) {
      return { cls: "snack-info", text: result.note ?? "No items resolved — nothing was sent." };
    }
    if (result.pushed) {
      return {
        cls: "snack-success",
        text: `${result.itemsResolved} item${result.itemsResolved === 1 ? "" : "s"} sent through ${
          device.collectorId ?? "this device"
        } / ${channelId}.`,
      };
    }
    return {
      cls: "snack-warning",
      text: `${result.itemsResolved} item${result.itemsResolved === 1 ? "" : "s"} resolved but not pushed${
        result.note ? `: ${result.note}` : "."
      }`,
    };
  })();

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manualFeedTitle"
        style={{ width: 560, maxWidth: "calc(100vw - 40px)" }}
      >
        <div className="modal-head">
          <h2 id="manualFeedTitle">Manual feed</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        {view === "new" ? (
          <ItemFeedForm
            feed={null}
            onSaved={(saved) => {
              setFeeds((prev) => [saved, ...(prev ?? [])]);
              setSelectedFeedId(saved.id);
              setView("list");
            }}
            onCancel={() => setView("list")}
          />
        ) : (
          <>
            <div className="modal-body">
              <p className="note" style={{ marginTop: 0 }}>
                {device.name}
                {device.collectorId ? ` · ${device.collectorId}` : ""}
              </p>
              <p style={{ margin: "0 0 12px", fontSize: 13 }}>
                Fire an Item Feed once through this device, now. It won&apos;t run the device&apos;s workflow or route
                items onward — just a single read on the channel you pick.
              </p>

              {error && <div className="snack snack-danger">{error}</div>}

              {channels.length > 1 && (
                <div className="field-block">
                  <label htmlFor="manualFeedChannel">Channel</label>
                  <select
                    id="manualFeedChannel"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                  >
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name ? `${c.id} — ${c.name}` : c.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="field-block">
                <label>Item feed</label>
                {!feeds ? (
                  <p className="note">Loading your feeds…</p>
                ) : feeds.length === 0 ? (
                  <p className="note">You have no item feeds yet — create one below.</p>
                ) : (
                  <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                    {feeds.map((f) => (
                      <label
                        key={f.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderTop: "1px solid var(--border)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="manualFeedPick"
                          checked={selectedFeedId === f.id}
                          onChange={() => setSelectedFeedId(f.id)}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="chip chip-brand">{KIND_LABEL[f.kind] ?? f.kind}</span>
                            <span style={{ fontWeight: 600 }}>{f.name}</span>
                          </span>
                          <span className="u-email" style={{ display: "block", marginTop: 2 }}>
                            {feedLine(f)}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="row-icon-btn row-icon-btn-ghost"
                          aria-label="Duplicate this feed"
                          title="Duplicate"
                          disabled={dupBusyId === f.id}
                          onClick={(e) => {
                            e.preventDefault();
                            handleDuplicate(f.id);
                          }}
                        >
                          <DuplicateIcon />
                        </button>
                      </label>
                    ))}
                  </div>
                )}
                <button type="button" className="attr-add-link" onClick={() => setView("new")}>
                  + New feed
                </button>
              </div>

              {selectedFeed && (
                <p className="note" style={{ marginTop: 4 }}>
                  {KINDS.find((k) => k.value === selectedFeed.kind)?.info}
                </p>
              )}

              {resultSnack && (
                <div className={`snack ${resultSnack.cls}`} style={{ marginBottom: 0 }}>
                  {resultSnack.text}
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSend}
                disabled={sending || !channelId || !selectedFeedId}
              >
                {sending ? "Sending…" : "Send now"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
