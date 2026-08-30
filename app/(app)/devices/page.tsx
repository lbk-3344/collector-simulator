"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialog } from "@/components/AppDialog";
import ReadPointIcon, { READ_POINT_LABELS, type ReadPointType } from "@/components/ui/ReadPointIcon";
import { DeviceConfigModal } from "@/components/DeviceConfigModal";
import { getDeviceState } from "@/lib/deviceState";
import type { DeviceRecord } from "@/lib/deviceConfig";
import type { BartenderLocation } from "@/lib/bartenderLocations";

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.3 3.5a1.9 1.9 0 0 1 2.7 2.7L7 15.2l-3.7 1 1-3.7 9-9Z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12" />
      <path d="M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6" />
      <path d="M5.5 6 6.2 16a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6" />
      <path d="M8.3 9v5M11.7 9v5" />
    </svg>
  );
}

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
  const [warning, setWarning] = useState<string | null>(null);
  const [configModal, setConfigModal] = useState<{ device: DeviceRecord | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm } = useDialog();

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
    const ok = await confirm({
      variant: "warning",
      title: "Delete device",
      message: `Delete ${device.name} permanently? This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;

    // Published Devices get a second, opt-in-every-time question (BL-054):
    // also deregister the real Bartender collector? Local delete happens
    // either way.
    let deregister = false;
    if (device.publishedAt) {
      deregister = await confirm({
        variant: "warning",
        title: "Deregister from Bartender?",
        message:
          "Also deregister this collector from the real Bartender platform? That removes its Zone mappings there and can't be undone on their side. The device is deleted here either way.",
        confirmLabel: "Deregister too",
        cancelLabel: "Just delete here",
      });
    }

    setBusyId(device.id);
    setError(null);
    setWarning(null);
    const res = await fetch(`/api/devices/${device.id}${deregister ? "?deregister=true" : ""}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't delete this device.");
    } else if (data?.platformDeregisterError) {
      setWarning(
        `Deleted here — platform deregistration failed: ${data.platformDeregisterError} It may still exist on Bartender.`
      );
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
      {warning && <div className="snack snack-warning">{warning}</div>}

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
                    <td className="u-meta">{device.task?.workflow?.name ?? "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="row-icon-btn row-icon-btn-edit"
                          aria-label="Edit"
                          title="Edit"
                          onClick={() => setConfigModal({ device })}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="row-icon-btn row-icon-btn-delete"
                          aria-label="Delete"
                          title="Delete"
                          disabled={isBusy}
                          onClick={() => handleDelete(device)}
                        >
                          <TrashIcon />
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
