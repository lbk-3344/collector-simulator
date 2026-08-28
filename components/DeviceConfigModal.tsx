"use client";

import { useEffect, useState } from "react";
import ReadPointIcon, { READ_POINT_TYPES, READ_POINT_LABELS, type ReadPointType } from "@/components/ui/ReadPointIcon";
import type { DeviceRecord, WorkflowRecord } from "@/lib/deviceConfig";

interface SiteOption {
  code: string;
  name: string;
}

interface AttrRow {
  key: string;
  value: string;
}

function attributesToRows(attrs: DeviceRecord["attributes"]): AttrRow[] {
  if (!attrs) return [];
  return Object.entries(attrs).map(([key, value]) => ({ key, value: String(value) }));
}

export interface DeviceConfigModalProps {
  open: boolean;
  // Existing device to edit — null only for the Devices-list "+ Add device"
  // flow, which has no map-drop position to pre-create a shell row from.
  device: DeviceRecord | null;
  presetType?: string;
  presetLocationCode?: string;
  // True when opened from the Overview map (drop or existing marker) — type
  // and site are then read-only, per CLAUDE-CONCEPT.md section 15.4.
  lockTypeAndSite: boolean;
  // True only for a just-dropped, never-configured shell — Cancel deletes
  // it rather than leaving an orphaned unconfigured Device (section 15.4).
  deleteOnCancelIfUnsaved: boolean;
  siteOptions: SiteOption[];
  onClose: () => void;
  onSaved: (device: DeviceRecord) => void;
  onDeleted?: (deviceId: string) => void;
}

// Same structural pattern as BugReportModal.tsx — see CHARTE-GRAPHIQUE.md
// "Device config screen", BACKLOG.md BL-045. Shared by the Overview map's
// Edit mode (BL-044) and the Devices list (BL-047).
export function DeviceConfigModal({
  open,
  device,
  presetType,
  presetLocationCode,
  lockTypeAndSite,
  deleteOnCancelIfUnsaved,
  siteOptions,
  onClose,
  onSaved,
  onDeleted,
}: DeviceConfigModalProps) {
  const [collectorId, setCollectorId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(READ_POINT_TYPES[0]);
  const [locationCode, setLocationCode] = useState("");
  const [model, setModel] = useState("");
  const [vendor, setVendor] = useState("");
  const [configVersion, setConfigVersion] = useState("");
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(true);
  const [heartbeatTimeoutSeconds, setHeartbeatTimeoutSeconds] = useState(120);
  const [attrs, setAttrs] = useState<AttrRow[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCollectorId(device?.collectorId ?? "");
    setName(device?.name ?? "");
    setType(device?.type ?? presetType ?? READ_POINT_TYPES[0]);
    setLocationCode(device?.locationCode ?? presetLocationCode ?? "");
    setModel(device?.model ?? "");
    setVendor(device?.vendor ?? "");
    setConfigVersion(device?.configVersion ?? "");
    setHeartbeatEnabled(device?.heartbeatEnabled ?? true);
    setHeartbeatTimeoutSeconds(device?.heartbeatTimeoutSeconds ?? 120);
    setAttrs(attributesToRows(device?.attributes ?? null));
    setWorkflowId(device?.workflowId ?? "");
    setError(null);
  }, [open, device, presetType, presetLocationCode]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/workflows")
      .then((res) => (res.ok ? res.json() : { workflows: [] }))
      .then((data) => setWorkflows(data.workflows ?? []))
      .catch(() => setWorkflows([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function handleCancel() {
    if (deleteOnCancelIfUnsaved && device) {
      await fetch(`/api/devices/${device.id}`, { method: "DELETE" }).catch(() => {});
      onDeleted?.(device.id);
    }
    onClose();
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!locationCode) {
      setError("Site is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const attributes = attrs.reduce<Record<string, string>>((acc, row) => {
      if (row.key.trim()) acc[row.key.trim()] = row.value;
      return acc;
    }, {});

    const body = {
      collectorId: collectorId.trim() || null,
      name: name.trim(),
      type,
      locationCode,
      model: model.trim() || null,
      vendor: vendor.trim() || null,
      configVersion: configVersion.trim() || null,
      heartbeatEnabled,
      heartbeatTimeoutSeconds,
      attributes: Object.keys(attributes).length ? attributes : null,
      workflowId: workflowId || null,
    };

    const res = device
      ? await fetch(`/api/devices/${device.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't save this device.");
      setSaving(false);
      return;
    }

    const data = await res.json();
    setSaving(false);
    onSaved(data.device);
  }

  function updateAttr(index: number, field: "key" | "value", value: string) {
    setAttrs((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }
  function removeAttr(index: number) {
    setAttrs((rows) => rows.filter((_, i) => i !== index));
  }

  const siteName = siteOptions.find((s) => s.code === locationCode)?.name ?? locationCode;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="deviceConfigTitle">
        <div className="modal-head">
          <h2 id="deviceConfigTitle">{device ? "Edit device" : "Add device"}</h2>
          <button className="modal-close" aria-label="Close" onClick={handleCancel}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="snack snack-danger">{error}</div>}

          <div className="field-block">
            <label htmlFor="deviceCollectorId">Collector ID</label>
            <input
              id="deviceCollectorId"
              type="text"
              value={collectorId}
              onChange={(e) => setCollectorId(e.target.value)}
              placeholder="e.g. TTMEMBASE-PORTAL-02"
            />
          </div>

          <div className="field-block">
            <label htmlFor="deviceName">Name</label>
            <input id="deviceName" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="field-row">
            <div className="field-block">
              <label>Read point type</label>
              {lockTypeAndSite ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0" }}>
                  <ReadPointIcon type={type} size={22} />
                  <span>{READ_POINT_LABELS[type as ReadPointType] ?? type}</span>
                </div>
              ) : (
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {READ_POINT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {READ_POINT_LABELS[t]}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="field-block">
              <label>Site</label>
              {lockTypeAndSite ? (
                <div style={{ padding: "9px 0" }}>{siteName}</div>
              ) : (
                <select value={locationCode} onChange={(e) => setLocationCode(e.target.value)}>
                  <option value="">Select a site…</option>
                  {siteOptions.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="field-row">
            <div className="field-block">
              <label htmlFor="deviceModel">Model</label>
              <input id="deviceModel" type="text" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="field-block">
              <label htmlFor="deviceVendor">Vendor</label>
              <input id="deviceVendor" type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
          </div>

          <div className="field-block">
            <label htmlFor="deviceConfigVersion">Config version</label>
            <input id="deviceConfigVersion" type="text" value={configVersion} onChange={(e) => setConfigVersion(e.target.value)} />
          </div>

          <div className="field-block">
            <label>Heartbeat</label>
            <div className="field-row" style={{ alignItems: "center" }}>
              <label className="checkbox-row">
                <input type="checkbox" checked={heartbeatEnabled} onChange={(e) => setHeartbeatEnabled(e.target.checked)} />
                Enabled
              </label>
              <input
                type="number"
                min={1}
                value={heartbeatTimeoutSeconds}
                onChange={(e) => setHeartbeatTimeoutSeconds(Number(e.target.value) || 0)}
                disabled={!heartbeatEnabled}
                style={{ maxWidth: 110 }}
              />
              <span className="note" style={{ marginTop: 0 }}>
                seconds
              </span>
            </div>
          </div>

          <div className="field-block">
            <label>Attributes</label>
            {attrs.map((row, i) => (
              <div className="attr-row" key={i}>
                <input type="text" placeholder="Key" value={row.key} onChange={(e) => updateAttr(i, "key", e.target.value)} />
                <input type="text" placeholder="Value" value={row.value} onChange={(e) => updateAttr(i, "value", e.target.value)} />
                <button type="button" className="attr-remove-btn" aria-label="Remove attribute" onClick={() => removeAttr(i)}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <line x1="5" y1="5" x2="15" y2="15" />
                    <line x1="15" y1="5" x2="5" y2="15" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" className="attr-add-link" onClick={() => setAttrs((rows) => [...rows, { key: "", value: "" }])}>
              + Add attribute
            </button>
          </div>

          <div className="field-block">
            <label htmlFor="deviceWorkflow">Workflow</label>
            <select id="deviceWorkflow" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
              <option value="">None</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.status === "RUNNING" ? "Running" : "Stopped"})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
