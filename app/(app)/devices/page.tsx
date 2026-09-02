"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDialog } from "@/components/AppDialog";
import { PageHeader } from "@/components/PageHeader";
import { SharedBadge } from "@/components/SharedBadge";
import ReadPointIcon, { READ_POINT_LABELS, type ReadPointType } from "@/components/ui/ReadPointIcon";
import { DeviceConfigModal } from "@/components/DeviceConfigModal";
import { getDeviceState } from "@/lib/deviceState";
import { useTableSort } from "@/lib/useTableSort";
import type { DeviceRecord } from "@/lib/deviceConfig";
import type { BartenderLocation } from "@/lib/bartenderLocations";

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.3 3.5a1.9 1.9 0 0 1 2.7 2.7L7 15.2l-3.7 1 1-3.7 9-9Z" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.5" />
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
function DuplicateIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}
function PowerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v7" />
      <path d="M6.3 5.7a5.5 5.5 0 1 0 7.4 0" />
    </svg>
  );
}

const STATE_LABELS: Record<string, string> = {
  PENDING: "Pending",
  READY: "Ready",
  ACTIVE: "Active",
  OFFLINE: "Offline",
};

const DEVICES_INFO = (
  <>
    <p>
      A <strong>device</strong> is a simulated read point — a stand-in for a real Bartender DataCollector, carrying the
      fields a real collector registration needs (collector ID, type, site, channels).
    </p>
    <p>
      Configure a device, then <strong>publish</strong> it to register it for real on the Track &amp; Trace platform. Its
      state (Pending / Ready / Active / Offline) reflects whether it is configured, published, attached to a running
      workflow, or manually turned off.
    </p>
  </>
);

// Tenant-wide Devices list, replacing the placeholder — see
// CHARTE-GRAPHIQUE.md "Devices list page", BACKLOG.md BL-047. Table pattern
// copied from UsersTable.tsx/BugReportsTable.tsx. "+ Add device" and each
// row's Edit both open the same DeviceConfigModal as the Overview map's Edit
// mode, just with Site/Type editable here (no map-drop position to infer
// them from).
export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRecord[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [locations, setLocations] = useState<BartenderLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [configModal, setConfigModal] = useState<{ device: DeviceRecord | null; readOnly?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState<string>(""); // "" = all sites (BUG #15)
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
    setCurrentUserId(data.currentUserId ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/locations")
      .then((res) => (res.ok ? res.json() : { locations: [] }))
      .then((data) => setLocations(data.locations ?? []))
      .catch(() => {});
    // Default the Site filter to whatever Overview is on (BUG #15).
    fetch("/api/settings/selected-location")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.locationCode && setSiteFilter(data.locationCode))
      .catch(() => {});
  }, []);

  const siteOptions = locations.map((l) => ({ code: l.code, name: l.name }));
  const siteName = useCallback(
    (code: string) => locations.find((l) => l.code === code)?.name ?? code,
    [locations]
  );

  // Only sites that actually have a device, for the filter dropdown.
  const filterSites = useMemo(() => {
    const codes = Array.from(new Set((devices ?? []).map((d) => d.locationCode)));
    return codes.map((c) => ({ code: c, name: siteName(c) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [devices, siteName]);

  const visible = useMemo(
    () => (devices ?? []).filter((d) => !siteFilter || d.locationCode === siteFilter),
    [devices, siteFilter]
  );

  const { rows, headerProps } = useTableSort(
    visible,
    {
      type: (d) => (READ_POINT_LABELS[d.type as ReadPointType] ?? d.type).toLowerCase(),
      name: (d) => d.name.toLowerCase(),
      site: (d) => siteName(d.locationCode).toLowerCase(),
      state: (d) => getDeviceState(d),
      workflow: (d) => d.task?.workflow?.name?.toLowerCase() ?? null,
    },
    { key: "name" }
  );

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

  // Manual OFFLINE toggle (BL-074). Only reachable from Ready/Offline — the
  // button is disabled otherwise, and the route re-checks server-side.
  async function handleOffline(device: DeviceRecord, offline: boolean) {
    setBusyId(device.id);
    setError(null);
    const res = await fetch(`/api/devices/${device.id}/offline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offline }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't change this device's status.");
    }
    await load();
    setBusyId(null);
  }

  // Clone via the shared POST /api/devices/[id]/duplicate (BL-065). No
  // position, no config modal — the clone is already as configured as its
  // source and always starts unpublished (see the route / §15.9).
  async function handleDuplicate(device: DeviceRecord) {
    setBusyId(device.id);
    setError(null);
    const res = await fetch(`/api/devices/${device.id}/duplicate`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't duplicate this device.");
    }
    await load();
    setBusyId(null);
  }

  return (
    <section className="fade-in">
      <PageHeader
        title="Devices"
        info={DEVICES_INFO}
        action={
          <button className="btn btn-primary" onClick={() => setConfigModal({ device: null })}>
            + Add device
          </button>
        }
      />

      {error && <div className="snack snack-danger">{error}</div>}
      {warning && <div className="snack snack-warning">{warning}</div>}

      {devices && devices.length > 0 && (
        <div className="list-toolbar">
          <label htmlFor="deviceSiteFilter">Site</label>
          <select id="deviceSiteFilter" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">All sites</option>
            {filterSites.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!devices ? (
        <p className="note">Loading devices…</p>
      ) : devices.length === 0 ? (
        <p className="note">No devices yet.</p>
      ) : rows.length === 0 ? (
        <p className="note">No devices at {siteName(siteFilter)}.</p>
      ) : (
        <div className="panel table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th {...headerProps("type")}>Type</th>
                <th {...headerProps("name")}>Name</th>
                <th {...headerProps("site")}>Site</th>
                <th {...headerProps("state")}>State</th>
                <th {...headerProps("workflow")}>Workflow</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((device) => {
                const state = getDeviceState(device);
                const isBusy = busyId === device.id;
                // Visible only because it's shared → read-only (BL-068).
                const readOnly = currentUserId != null && device.ownerId !== currentUserId;
                // Manual offline toggle (BL-074): only Ready ↔ Offline.
                const canToggleOffline = state === "READY" || state === "OFFLINE";
                const offlineTitle = readOnly
                  ? "Shared with you — read-only"
                  : state === "PENDING"
                    ? "Publish this device first"
                    : state === "ACTIVE"
                      ? "Part of a running workflow — stop the workflow to take this offline"
                      : state === "OFFLINE"
                        ? "Turn on"
                        : "Turn offline";
                return (
                  <tr key={device.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ReadPointIcon type={device.type} size={28} />
                        <span>{READ_POINT_LABELS[device.type as ReadPointType] ?? device.type}</span>
                      </div>
                    </td>
                    <td>
                      <div className="u-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {device.name}
                        {readOnly && <SharedBadge />}
                      </div>
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
                          aria-label={readOnly ? "View" : "Edit"}
                          title={readOnly ? "View (shared — read-only)" : "Edit"}
                          onClick={() => setConfigModal({ device, readOnly })}
                        >
                          {readOnly ? <EyeIcon /> : <EditIcon />}
                        </button>
                        <button
                          className="row-icon-btn row-icon-btn-ghost"
                          aria-label={state === "OFFLINE" ? "Turn device on" : "Turn device offline"}
                          title={offlineTitle}
                          disabled={isBusy || readOnly || !canToggleOffline}
                          onClick={() => handleOffline(device, state !== "OFFLINE")}
                        >
                          <PowerIcon />
                        </button>
                        <button
                          className="row-icon-btn row-icon-btn-ghost"
                          aria-label="Duplicate"
                          title={readOnly ? "Shared with you — read-only" : "Duplicate"}
                          disabled={isBusy || readOnly}
                          onClick={() => handleDuplicate(device)}
                        >
                          <DuplicateIcon />
                        </button>
                        <button
                          className="row-icon-btn row-icon-btn-delete"
                          aria-label="Delete"
                          title={readOnly ? "Shared with you — read-only" : "Delete"}
                          disabled={isBusy || readOnly}
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
        readOnly={configModal?.readOnly ?? false}
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
