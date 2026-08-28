"use client";

import { useCallback, useEffect, useState } from "react";
import ReadPointIcon, { READ_POINT_LABELS, type ReadPointType } from "@/components/ui/ReadPointIcon";
import { DeviceConfigModal } from "@/components/DeviceConfigModal";
import { getDeviceState } from "@/lib/deviceState";
import type { DeviceRecord } from "@/lib/deviceConfig";
import type { BartenderLocation } from "@/lib/bartenderLocations";

const STATE_LABELS: Record<string, string> = {
  OFF: "Off",
  ACTIVE: "Active",
  AUTOMATED: "Automated",
  PROBLEM: "Problem",
};

// Tenant-wide Devices list, replacing the placeholder — see
// CHARTE-GRAPHIQUE.md "Devices list page", BACKLOG.md BL-047. Table pattern
// copied from UsersTable.tsx/BugReportsTable.tsx. "+ Add device" and each
// row's Edit both open the same DeviceConfigModal as the Overview map's Edit
// mode, just with Site/Type editable here (no map-drop position to infer
// them from).
export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRecord[] | null>(null);
  const [locations, setLocations] = useState<BartenderLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [configModal, setConfigModal] = useState<{ device: DeviceRecord | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/devices");
    if (!res.ok) {
      setError("Couldn't load devices.");
      return;
    }
    const data = await res.json();
    setDevices(data.devices ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/locations")
      .then((res) => (res.ok ? res.json() : { locations: [] }))
      .then((data) => setLocations(data.locations ?? []))
      .catch(() => {});
  }, []);

  const siteOptions = locations.map((l) => ({ code: l.code, name: l.name }));
  function siteName(code: string) {
    return locations.find((l) => l.code === code)?.name ?? code;
  }

  async function handleDelete(device: DeviceRecord) {
    if (!confirm(`Delete ${device.name} permanently? This can't be undone.`)) return;
    setBusyId(device.id);
    setError(null);
    const res = await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't delete this device.");
    }
    await load();
    setBusyId(null);
  }

  return (
    <section className="fade-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Devices
        </h1>
        <button className="btn btn-primary" onClick={() => setConfigModal({ device: null })}>
          + Add device
        </button>
      </div>

      {error && <div className="snack snack-danger">{error}</div>}

      {!devices ? (
        <p className="note">Loading devices…</p>
      ) : devices.length === 0 ? (
        <p className="note">No devices yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Site</th>
                <th>State</th>
                <th>Workflow</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => {
                const state = getDeviceState(device);
                const isBusy = busyId === device.id;
                return (
                  <tr key={device.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ReadPointIcon type={device.type} size={28} />
                        <span>{READ_POINT_LABELS[device.type as ReadPointType] ?? device.type}</span>
                      </div>
                    </td>
                    <td>
                      <div className="u-name">{device.name}</div>
                      <div className="u-email">{device.collectorId ?? "—"}</div>
                    </td>
                    <td className="u-meta">{siteName(device.locationCode)}</td>
                    <td>
                      <span className={`device-state device-state-${state.toLowerCase()}`}>
                        <span className="device-state-dot" />
                        {STATE_LABELS[state]}
                      </span>
                    </td>
                    <td className="u-meta">{device.workflow ? device.workflow.name : "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary small" onClick={() => setConfigModal({ device })}>
                          Edit
                        </button>
                        <button className="btn btn-ghost-danger" disabled={isBusy} onClick={() => handleDelete(device)}>
                          Delete
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

      <DeviceConfigModal
        open={Boolean(configModal)}
        device={configModal?.device ?? null}
        lockTypeAndSite={false}
        deleteOnCancelIfUnsaved={false}
        siteOptions={siteOptions}
        onClose={() => setConfigModal(null)}
        onSaved={() => {
          setConfigModal(null);
          load();
        }}
        onDeleted={() => {
          setConfigModal(null);
          load();
        }}
      />
    </section>
  );
}
