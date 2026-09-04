"use client";

import { useCallback, useEffect, useState } from "react";
import type { BartenderLocation } from "@/lib/bartenderLocations";

// BL-079 (§17.7) — Settings → Hidden items. Everything the current user has
// personally removed from their own view (shared-not-owned Devices /
// Workflows / Item Feeds), with a Restore action per row. Same visual shape
// as the admin-only SharedResourcesTable, but scoped to the caller and NOT
// admin-gated.

type Kind = "device" | "workflow" | "itemFeed";

type Row = {
  kind: Kind;
  id: string;
  name: string;
  sub: string; // device type / feed kind / "" for workflows
  collectorId: string | null;
  locationCode: string | null;
  owner: { id: string; name: string | null; email: string };
};

const KIND_LABEL: Record<Kind, string> = { device: "Device", workflow: "Workflow", itemFeed: "Item Feed" };
const KIND_CHIP: Record<Kind, string> = { device: "chip-info", workflow: "chip-success", itemFeed: "chip-warning" };
const HIDE_PATH: Record<Kind, string> = {
  device: "/api/devices",
  workflow: "/api/workflows",
  itemFeed: "/api/item-feeds",
};
const FEED_KIND_LABEL: Record<string, string> = { NEW: "New", PRESENT: "In stock", FIXED: "Fixed" };

export function HiddenResourcesTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [locations, setLocations] = useState<BartenderLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const siteName = useCallback(
    (code: string | null) => (code ? locations.find((l) => l.code === code)?.name ?? code : "—"),
    [locations]
  );

  useEffect(() => {
    fetch("/api/locations")
      .then((res) => (res.ok ? res.json() : { locations: [] }))
      .then((data) => setLocations(data.locations ?? []))
      .catch(() => setLocations([]));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/hidden-resources", { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn't load your hidden items.");
      return;
    }
    const data = await res.json();
    const merged: Row[] = [
      ...(data.devices ?? []).map((d: Record<string, unknown>) => ({
        kind: "device" as const,
        id: d.id as string,
        name: d.name as string,
        sub: (d.type as string) ?? "",
        collectorId: (d.collectorId as string | null) ?? null,
        locationCode: (d.locationCode as string | null) ?? null,
        owner: d.owner as Row["owner"],
      })),
      ...(data.workflows ?? []).map((w: Record<string, unknown>) => ({
        kind: "workflow" as const,
        id: w.id as string,
        name: w.name as string,
        sub: "",
        collectorId: null,
        locationCode: null,
        owner: w.owner as Row["owner"],
      })),
      ...(data.itemFeeds ?? []).map((f: Record<string, unknown>) => ({
        kind: "itemFeed" as const,
        id: f.id as string,
        name: f.name as string,
        sub: FEED_KIND_LABEL[f.kind as string] ?? (f.kind as string) ?? "",
        collectorId: null,
        locationCode: (f.locationCode as string | null) ?? null,
        owner: f.owner as Row["owner"],
      })),
    ];
    setRows(merged);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function restore(row: Row) {
    const key = `${row.kind}:${row.id}`;
    setBusyKey(key);
    setError(null);
    const res = await fetch(`${HIDE_PATH[row.kind]}/${row.id}/hide`, { method: "DELETE" });
    if (res.ok) {
      setRows((rs) => rs?.filter((r) => !(r.kind === row.kind && r.id === row.id)) ?? rs);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't restore this item.");
    }
    setBusyKey(null);
  }

  if (!rows) return <p className="note">Loading your hidden items…</p>;

  if (rows.length === 0) {
    return (
      <p className="note">
        Nothing hidden — shared items you remove from your view (with the eye-slash button on the Devices, Item Feeds or
        Workflows lists) show up here, and you can bring them back.
      </p>
    );
  }

  return (
    <>
      {error && <div className="snack snack-danger">{error}</div>}
      <div className="table-scroll">
        <table className="users">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Location</th>
              <th>Owner</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.kind}:${row.id}`;
              return (
                <tr key={key}>
                  <td>
                    <span className={`chip ${KIND_CHIP[row.kind]}`}>{KIND_LABEL[row.kind]}</span>
                  </td>
                  <td>
                    <div className="u-name">{row.name}</div>
                    {row.sub && <div className="u-email">{row.sub}</div>}
                    {row.kind === "device" && <div className="u-meta">{row.collectorId ?? "no Collector ID yet"}</div>}
                  </td>
                  <td>{siteName(row.locationCode)}</td>
                  <td>
                    <div className="u-name">{row.owner?.name ?? "—"}</div>
                    <div className="u-email">{row.owner?.email}</div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary small"
                      disabled={busyKey === key}
                      onClick={() => restore(row)}
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Restoring brings the item back to your lists and the Overview map / workflow canvas. This only affects your own
        view — it never changed anything for the item&apos;s owner or other users.
      </p>
    </>
  );
}
