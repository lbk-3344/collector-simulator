"use client";

import { useCallback, useEffect, useState } from "react";
import ReadPointIcon, { READ_POINT_TYPES, READ_POINT_LABELS, type ReadPointType } from "@/components/ui/ReadPointIcon";
import { getDeviceState } from "@/lib/deviceState";
import type { DeviceChannel, DeviceRecord, ReconciliationMapping, WorkflowRecord } from "@/lib/deviceConfig";

interface SiteOption {
  code: string;
  name: string;
}

interface AttrRow {
  key: string;
  value: string;
}

const STATE_LABELS: Record<string, string> = {
  OFF: "Off",
  ACTIVE: "Active",
  AUTOMATED: "Automated",
  PROBLEM: "Problem",
};

function attributesToRows(attrs: DeviceRecord["attributes"]): AttrRow[] {
  if (!attrs) return [];
  return Object.entries(attrs).map(([key, value]) => ({ key, value: String(value) }));
}

function renumberChannels(rows: DeviceChannel[]): DeviceChannel[] {
  return rows.map((row, i) => ({ ...row, id: `CH${i + 1}` }));
}

const DEFAULT_CHANNELS: DeviceChannel[] = [{ id: "CH1", type: "PRESENCE", presenceEvent: "PRESENT" }];

// Small inline icon set for this modal's Channels/Collector-ID/Publish
// additions (BL-049/050/051) — see CHARTE-GRAPHIQUE.md "Device config
// screen" for the glyph descriptions. 20px viewBox, currentColor stroke,
// matching the modal's existing close-button icon weight.
function RegenerateIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10a6 6 0 0 1 10.5-4" />
      <path d="M16 10a6 6 0 0 1-10.5 4" />
      <path d="M14 2.5V6h-3.5" />
      <path d="M6 17.5V14h3.5" />
    </svg>
  );
}
function AntennaIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="16" r="1.2" fill="currentColor" stroke="none" />
      <path d="M6.5 12.5a5 5 0 0 1 7 0" />
      <path d="M4 9.5a9 9 0 0 1 12 0" />
      <path d="M1.5 6.5a13 13 0 0 1 17 0" />
    </svg>
  );
}
function PresenceTypeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="4" />
      <circle cx="10" cy="10" r="7" opacity="0.55" />
    </svg>
  );
}
function DirectionalTypeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h14" />
      <path d="M6.2 6.5 3 10l3.2 3.5" />
      <path d="M13.8 6.5 17 10l-3.2 3.5" />
    </svg>
  );
}
function FirstSeenIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5v10" />
      <path d="M11 5h2M11 15h2" />
      <path d="M3 10h7" />
      <path d="M7 7l3 3-3 3" />
    </svg>
  );
}
function PresentIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
function LastSeenIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 5v10" />
      <path d="M7 5h2M7 15h2" />
      <path d="M10 10h7" />
      <path d="M13 7l3 3-3 3" />
    </svg>
  );
}
function InboundIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v9" />
      <path d="M6.5 9 10 12.5 13.5 9" />
      <path d="M4 15.5h12" />
    </svg>
  );
}
function OutboundIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17V8" />
      <path d="M6.5 11 10 7.5 13.5 11" />
      <path d="M4 4.5h12" />
    </svg>
  );
}
function CloudUploadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M6.2 14a3.4 3.4 0 0 1-.5-6.76A4.4 4.4 0 0 1 13.9 6.1a3.2 3.2 0 0 1-.4 7.9H6.2Z" />
      <path d="M10 15V9" />
      <path d="M7.5 11.5 10 9l2.5 2.5" />
    </svg>
  );
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
// "Device config screen", BACKLOG.md BL-045, revised for BL-049/050/051
// (Channels, Collector ID auto-suggest, Publish to platform).
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
  const [channels, setChannels] = useState<DeviceChannel[]>(DEFAULT_CHANNELS);
  const [workflowId, setWorkflowId] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);

  // "draft" | "publish" | "save" while a save request for that action is in
  // flight — tracks which footer button to show a busy label on.
  const [saving, setSaving] = useState<"draft" | "publish" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set to the saved Device when a platform-syncing save came back with a
  // problem (lastSyncError, or a CONFLICT/BROKEN reconciliation) — the modal
  // then stays open showing the banner/flags, and the foot becomes a single
  // "Close" that hands this Device up via onSaved. Null on a clean save.
  const [postSave, setPostSave] = useState<DeviceRecord | null>(null);

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
    setChannels(device?.channels && device.channels.length ? device.channels : DEFAULT_CHANNELS);
    setWorkflowId(device?.workflowId ?? "");
    setError(null);
    setPostSave(null);
  }, [open, device, presetType, presetLocationCode]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/workflows")
      .then((res) => (res.ok ? res.json() : { workflows: [] }))
      .then((data) => setWorkflows(data.workflows ?? []))
      .catch(() => setWorkflows([]));
  }, [open]);

  // Collector ID auto-suggestion (BL-050) — pulls a fresh {site}-{TYPE}-{NN}
  // suggestion, used both by the effect below (automatic, only when the
  // field is currently empty) and the regenerate icon button (explicit,
  // always overwrites).
  const suggestCollectorId = useCallback(async () => {
    if (!type || !locationCode) return;
    const res = await fetch(`/api/devices/suggest-code?locationCode=${encodeURIComponent(locationCode)}&type=${encodeURIComponent(type)}`);
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (data?.code) setCollectorId(data.code);
  }, [type, locationCode]);

  useEffect(() => {
    if (!open) return;
    if (collectorId.trim()) return; // never overwrite a value already present
    if (!type || !locationCode) return;
    suggestCollectorId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, locationCode]);

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

  async function handleSave(action: "draft" | "publish" | "save") {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!locationCode) {
      setError("Site is required.");
      return;
    }
    setSaving(action);
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
      channels,
      workflowId: workflowId || null,
      publish: action === "publish",
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
      setSaving(null);
      return;
    }

    const saved: DeviceRecord = (await res.json()).device;
    setSaving(null);

    // A platform-syncing save (Publish, or Save on an already-published
    // Device) can come back with the config persisted locally but the
    // register call failed, or succeeded with per-Channel reconciliation
    // flags — keep the modal open so that's visible (section 15.8). A draft
    // save or a clean sync just closes as before.
    if (action !== "draft" && (saved.lastSyncError || conflictOrBrokenMappings(saved).length > 0)) {
      setPostSave(saved);
      return;
    }
    onSaved(saved);
  }

  // CONFLICT / BROKEN reconciliation entries only — OFFLINE is expected
  // (this app never sends heartbeats) and not surfaced. Section 15.8.
  function conflictOrBrokenMappings(d: DeviceRecord | null): ReconciliationMapping[] {
    const mappings = d?.platformReconciliation?.affectedMappings ?? [];
    return mappings.filter((m) => m.mappingStatus === "CONFLICT" || m.mappingStatus === "BROKEN");
  }

  function updateAttr(index: number, field: "key" | "value", value: string) {
    setAttrs((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }
  function removeAttr(index: number) {
    setAttrs((rows) => rows.filter((_, i) => i !== index));
  }

  function addChannel() {
    setChannels((rows) => renumberChannels([...rows, { id: "", type: "PRESENCE", presenceEvent: "PRESENT" }]));
  }
  function removeChannel(index: number) {
    setChannels((rows) => (rows.length <= 1 ? rows : renumberChannels(rows.filter((_, i) => i !== index))));
  }
  function setChannelType(index: number, type: "PRESENCE" | "DIRECTIONAL") {
    setChannels((rows) =>
      rows.map((row, i) =>
        i === index
          ? type === "PRESENCE"
            ? { id: row.id, name: row.name, type, presenceEvent: "PRESENT" }
            : { id: row.id, name: row.name, type, direction: "INBOUND" }
          : row
      )
    );
  }
  function setChannelPresenceEvent(index: number, presenceEvent: DeviceChannel["presenceEvent"]) {
    setChannels((rows) => rows.map((row, i) => (i === index ? { ...row, presenceEvent } : row)));
  }
  function setChannelDirection(index: number, direction: DeviceChannel["direction"]) {
    setChannels((rows) => rows.map((row, i) => (i === index ? { ...row, direction } : row)));
  }
  function setChannelName(index: number, name: string) {
    setChannels((rows) => rows.map((row, i) => (i === index ? { ...row, name } : row)));
  }

  const siteName = siteOptions.find((s) => s.code === locationCode)?.name ?? locationCode;
  const isPublished = Boolean(device?.publishedAt);
  const stateForPill = device ? getDeviceState(device) : null;

  // Platform-sync feedback: the just-saved Device if we're holding the modal
  // open on a sync problem, otherwise the Device as passed in (so a stored
  // lastSyncError from a past failed publish shows on reopen).
  const syncSource = postSave ?? device;
  const syncBanner = syncSource?.lastSyncError ?? null;
  const reconByChannel = new Map<string, ReconciliationMapping>();
  for (const m of conflictOrBrokenMappings(syncSource)) reconByChannel.set(m.channelId, m);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="deviceConfigTitle">
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="modal-head-icon" aria-hidden="true">
              <ReadPointIcon type={type} size={32} />
            </div>
            <h2 id="deviceConfigTitle">{device ? "Edit device" : "Add device"}</h2>
            {stateForPill && (
              <span className={`device-state device-state-${stateForPill.toLowerCase()}`}>
                <span className="device-state-dot" />
                {STATE_LABELS[stateForPill]}
              </span>
            )}
          </div>
          <button className="modal-close" aria-label="Close" onClick={handleCancel}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {syncBanner && <div className="error-banner">{syncBanner}</div>}
          {postSave?.lastSyncError && (
            <div className="snack snack-danger">Saved here — publishing to Bartender failed.</div>
          )}
          {postSave && !postSave.lastSyncError && reconByChannel.size > 0 && (
            <div className="snack snack-warning">Published — some channels need review on Bartender.</div>
          )}
          {error && <div className="snack snack-danger">{error}</div>}

          <div className="field-block">
            <label htmlFor="deviceCollectorId">Collector ID</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                id="deviceCollectorId"
                type="text"
                value={collectorId}
                onChange={(e) => setCollectorId(e.target.value)}
                placeholder="e.g. TTMEMBASE-PORTAL-02"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="field-icon-btn"
                aria-label="Suggest a new Collector ID"
                title="Suggest a new Collector ID"
                onClick={suggestCollectorId}
              >
                <RegenerateIcon />
              </button>
            </div>
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
                  <ReadPointIcon type={type} size={26} />
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
            <label>
              <span className="field-label-icon" aria-hidden="true">
                <AntennaIcon />
              </span>
              Channels
            </label>
            {channels.map((row, i) => (
              <div className="channel-row" key={i}>
                <div className="channel-row-top">
                  <span className="channel-row-id">{row.id}</span>
                  {reconByChannel.get(row.id) && (
                    <span
                      className="channel-recon-flag"
                      data-status={reconByChannel.get(row.id)!.mappingStatus}
                      title={
                        reconByChannel.get(row.id)!.detail ||
                        reconByChannel.get(row.id)!.issue ||
                        reconByChannel.get(row.id)!.mappingStatus
                      }
                      aria-label={`Platform: ${reconByChannel.get(row.id)!.mappingStatus}`}
                    >
                      ▲
                    </span>
                  )}
                  <input
                    type="text"
                    className="channel-name-input"
                    placeholder="Channel name (optional)"
                    value={row.name ?? ""}
                    onChange={(e) => setChannelName(i, e.target.value)}
                    aria-label={`${row.id} name`}
                  />
                  <button
                    type="button"
                    className="attr-remove-btn"
                    aria-label="Remove channel"
                    disabled={channels.length <= 1}
                    style={channels.length <= 1 ? { visibility: "hidden" } : undefined}
                    onClick={() => removeChannel(i)}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <line x1="5" y1="5" x2="15" y2="15" />
                      <line x1="15" y1="5" x2="5" y2="15" />
                    </svg>
                  </button>
                </div>
                <div className="channel-row-toggles">
                  <div className="icon-toggle" role="group" aria-label="Channel type">
                    <button
                      type="button"
                      className={`icon-toggle-btn${row.type === "PRESENCE" ? " selected" : ""}`}
                      title="Presence"
                      aria-label="Presence"
                      onClick={() => setChannelType(i, "PRESENCE")}
                    >
                      <PresenceTypeIcon />
                    </button>
                    <button
                      type="button"
                      className={`icon-toggle-btn${row.type === "DIRECTIONAL" ? " selected" : ""}`}
                      title="Directional"
                      aria-label="Directional"
                      onClick={() => setChannelType(i, "DIRECTIONAL")}
                    >
                      <DirectionalTypeIcon />
                    </button>
                  </div>

                  {row.type === "PRESENCE" ? (
                    <div className="icon-toggle" role="group" aria-label="Presence event">
                      <button
                        type="button"
                        className={`icon-toggle-btn${row.presenceEvent === "FIRST_SEEN" ? " selected" : ""}`}
                        title="First seen"
                        aria-label="First seen"
                        onClick={() => setChannelPresenceEvent(i, "FIRST_SEEN")}
                      >
                        <FirstSeenIcon />
                      </button>
                      <button
                        type="button"
                        className={`icon-toggle-btn${row.presenceEvent === "PRESENT" ? " selected" : ""}`}
                        title="Present"
                        aria-label="Present"
                        onClick={() => setChannelPresenceEvent(i, "PRESENT")}
                      >
                        <PresentIcon />
                      </button>
                      <button
                        type="button"
                        className={`icon-toggle-btn${row.presenceEvent === "LAST_SEEN" ? " selected" : ""}`}
                        title="Last seen"
                        aria-label="Last seen"
                        onClick={() => setChannelPresenceEvent(i, "LAST_SEEN")}
                      >
                        <LastSeenIcon />
                      </button>
                    </div>
                  ) : (
                    <div className="icon-toggle" role="group" aria-label="Direction">
                      <button
                        type="button"
                        className={`icon-toggle-btn${row.direction === "INBOUND" ? " selected" : ""}`}
                        title="Inbound"
                        aria-label="Inbound"
                        onClick={() => setChannelDirection(i, "INBOUND")}
                      >
                        <InboundIcon />
                      </button>
                      <button
                        type="button"
                        className={`icon-toggle-btn${row.direction === "OUTBOUND" ? " selected" : ""}`}
                        title="Outbound"
                        aria-label="Outbound"
                        onClick={() => setChannelDirection(i, "OUTBOUND")}
                      >
                        <OutboundIcon />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="attr-add-link" onClick={addChannel}>
              + Add channel
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
          {postSave ? (
            // Held open on a sync problem — the save already persisted; this
            // just hands the saved Device up and closes.
            <button className="btn btn-primary" onClick={() => onSaved(postSave)}>
              Close
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              {!isPublished ? (
                <>
                  <button className="btn btn-secondary" onClick={() => handleSave("draft")} disabled={saving !== null}>
                    {saving === "draft" ? "Saving…" : "Save draft"}
                  </button>
                  <button className="btn btn-primary" onClick={() => handleSave("publish")} disabled={saving !== null}>
                    <CloudUploadIcon />
                    {saving === "publish" ? "Publishing…" : "Publish to platform"}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => handleSave("save")} disabled={saving !== null}>
                  {saving === "save" ? "Saving…" : "Save"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
