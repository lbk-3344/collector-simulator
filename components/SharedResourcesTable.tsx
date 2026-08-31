"use client";

import { useCallback, useEffect, useState } from "react";

// BL-069 — admin-only "Shared resources" screen (CLAUDE-CONCEPT.md §17.4/§17.6).
// Lists every Device / Workflow / Item Feed across all owners with a toggle
// that flips its `shared` flag. Flipping `shared` on makes the resource
// visible (read-only) to every other user; off returns it to its owner only.

type Kind = "device" | "workflow" | "itemFeed";

type Row = {
  kind: Kind;
  id: string;
  name: string;
  sub: string; // device type / feed kind / "" for workflows
  shared: boolean;
  owner: { id: string; name: string | null; email: string };
};

const KIND_LABEL: Record<Kind, string> = { device: "Device", workflow: "Workflow", itemFeed: "Item Feed" };
const KIND_CHIP: Record<Kind, string> = { device: "chip-info", workflow: "chip-success", itemFeed: "chip-warning" };
const SHARE_PATH: Record<Kind, string> = {
  device: "/api/devices",
  workflow: "/api/workflows",
  itemFeed: "/api/item-feeds",
};

// "In stock" is the user-facing label for the PRESENT feed kind (BUG #cmth5k10o).
const FEED_KIND_LABEL: Record<string, string> = { NEW: "New", PRESENT: "In stock", FIXED: "Fixed" };

export function SharedResourcesTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/shared-resources");
    if (!res.ok) {
      setError("Couldn't load shared resources.");
      return;
    }
    const data = await res.json();
    const merged: Row[] = [
      ...(data.devices ?? []).map((d: Record<string, unknown>) => ({
        kind: "device" as const,
        id: d.id as string,
        name: d.name as string,
        sub: (d.type as string) ?? "",
        shared: Boolean(d.shared),
        owner: d.owner as Row["owner"],
      })),
      ...(data.workflows ?? []).map((w: Record<string, unknown>) => ({
        kind: "workflow" as const,
        id: w.id as string,
        name: w.name as string,
        sub: "",
        shared: Boolean(w.shared),
        owner: w.owner as Row["owner"],
      })),
      ...(data.itemFeeds ?? []).map((f: Record<string, unknown>) => ({
        kind: "itemFeed" as const,
        id: f.id as string,
        name: f.name as string,
        sub: FEED_KIND_LABEL[f.kind as string] ?? (f.kind as string) ?? "",
        shared: Boolean(f.shared),
        owner: f.owner as Row["owner"],
      })),
    ];
    setRows(merged);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(row: Row) {
    const key = `${row.kind}:${row.id}`;
    const next = !row.shared;
    setBusyKey(key);
    setError(null);
    // Optimistic flip.
    setRows((rs) => rs?.map((r) => (r.kind === row.kind && r.id === row.id ? { ...r, shared: next } : r)) ?? rs);
    const res = await fetch(`${SHARE_PATH[row.kind]}/${row.id}/share`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shared: next }),
    });
    if (!res.ok) {
      // Revert.
      setRows((rs) => rs?.map((r) => (r.kind === row.kind && r.id === row.id ? { ...r, shared: row.shared } : r)) ?? rs);
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't change sharing for this resource.");
    }
    setBusyKey(null);
  }

  if (!rows) return <p className="note">Loading shared resources…</p>;

  return (
    <>
      {error && <div className="snack snack-danger">{error}</div>}
      <div className="table-scroll">
        <table className="users">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Owner</th>
              <th>Shared with everyone</th>
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
                  </td>
                  <td>
                    <div className="u-name">{row.owner?.name ?? "—"}</div>
                    <div className="u-email">{row.owner?.email}</div>
                  </td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={row.shared}
                      className="toggle-switch"
                      disabled={busyKey === key}
                      title={row.shared ? "Shared — click to make private" : "Private — click to share with everyone"}
                      onClick={() => toggle(row)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Turning this on makes the resource visible (read-only) to every other user. Its owner keeps full edit
        control; nobody else can modify it.
      </p>
    </>
  );
}
