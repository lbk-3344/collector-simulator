"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReadPointIcon, { READ_POINT_TYPES, READ_POINT_LABELS } from "@/components/ui/ReadPointIcon";
import { DeviceConfigModal } from "@/components/DeviceConfigModal";
import { getDeviceState } from "@/lib/deviceState";
import type { DeviceRecord } from "@/lib/deviceConfig";
import type { LocationMap, LocationZone } from "@/lib/bartenderLocations";

const MAX_SCALE = 6;
const SCALE_STEP = 0.2;
const DRAG_THRESHOLD_PX = 4;

type ConfigModalState = {
  device: DeviceRecord | null;
  lockTypeAndSite: boolean;
  deleteOnCancelIfUnsaved: boolean;
  presetType?: string;
};

export interface LocationMapCardProps {
  locationCode: string | null;
  // Devices are owned by OverviewClient (not fetched here) so Edit-mode
  // changes made on the map immediately reflect in the "Devices online" KPI
  // card too — see BACKLOG.md BL-042 to BL-047.
  devices: DeviceRecord[];
  onDevicesChange: (update: DeviceRecord[] | ((prev: DeviceRecord[]) => DeviceRecord[])) => void;
}

// Replaces the placeholder panel beneath the KPI row — see
// CHARTE-GRAPHIQUE.md "Location map card", BACKLOG.md BL-038. Fetches the
// selected site's floor plan + zones; renders them, plus the caller-owned
// devices, as absolutely-positioned markers inside a scale/translate
// transform layer so they stay correctly placed at any zoom. Edit mode
// (BL-044) and non-Edit-mode click behavior (BL-046) both live here since
// both act on the same device markers.
export function LocationMapCard({ locationCode, devices, onDevicesChange }: LocationMapCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMap, setHasMap] = useState(false);
  const [map, setMap] = useState<LocationMap | null>(null);
  const [zones, setZones] = useState<LocationZone[]>([]);

  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  // Counteracts .map-card-transform's own zoom scale so markers stay a
  // constant on-screen size at any zoom level instead of shrinking to
  // sub-pixel size at the default zoomed-out "fit to screen" scale.
  const markerCounterScale = scale > 0 ? 1 / scale : 1;
  const [panMode, setPanMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Edit-mode palette drag (create) — tracked at window level since the
  // pointer travels from the top-left palette across the map viewport.
  const [draggingPaletteType, setDraggingPaletteType] = useState<string | null>(null);
  const [paletteDragPos, setPaletteDragPos] = useState<{ x: number; y: number } | null>(null);

  // Edit-mode marker drag (reposition) — same window-level tracking; also
  // doubles as click detection (a mouseup with no real movement is a click).
  const deviceDragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
    currentPosX: number;
    currentPosY: number;
    moved: boolean;
  } | null>(null);
  const [draggingDeviceVisual, setDraggingDeviceVisual] = useState<{ id: string; x: number; y: number } | null>(null);

  const [configModal, setConfigModal] = useState<ConfigModalState | null>(null);
  const [manualSendDevice, setManualSendDevice] = useState<DeviceRecord | null>(null);
  const [infoPanelDevice, setInfoPanelDevice] = useState<DeviceRecord | null>(null);

  // Fits the whole floor plan inside the card's viewport — floor plans can be
  // thousands of pixels wide (see CLAUDE-CONCEPT.md section 7.4), so showing
  // them at native size on load left most of the map off-screen. Also used
  // by the "Fit to screen" control to recenter after panning/zooming.
  const applyFit = useCallback(() => {
    const img = imgRef.current;
    const viewport = viewportRef.current;
    if (!img || !viewport || !img.naturalWidth || !img.naturalHeight) return;
    const fit = Math.min(viewport.clientWidth / img.naturalWidth, viewport.clientHeight / img.naturalHeight);
    setMinScale(fit);
    setScale(fit);
    setTranslate({
      x: (viewport.clientWidth - img.naturalWidth * fit) / 2,
      y: (viewport.clientHeight - img.naturalHeight * fit) / 2,
    });
  }, []);

  useEffect(() => {
    if (!locationCode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setPanMode(false);
    setEditMode(false);

    async function load() {
      try {
        const [mapRes, zonesRes] = await Promise.all([
          fetch(`/api/locations/${encodeURIComponent(locationCode as string)}/map`),
          fetch(`/api/locations/${encodeURIComponent(locationCode as string)}/zones`),
        ]);
        if (cancelled) return;

        if (!mapRes.ok) {
          const data = await mapRes.json().catch(() => null);
          throw new Error(data?.error ?? "Couldn't load the floor plan.");
        }
        const mapData = await mapRes.json();
        setHasMap(Boolean(mapData.hasMap));
        setMap(mapData.hasMap ? mapData.map : null);

        const zonesData = zonesRes.ok ? await zonesRes.json().catch(() => null) : null;
        setZones(zonesData?.zones ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the location map.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [locationCode]);

  // Re-fit on any viewport size change (window resize, sidebar collapse/
  // expand) — otherwise a fit computed for the old size goes stale. Only
  // attaches once the real card (not the loading/error placeholder) is
  // actually in the DOM, hence the hasMap/map/loading deps re-triggering
  // this after that swap.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => applyFit());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [applyFit, hasMap, map, loading]);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(minScale, +(s - SCALE_STEP).toFixed(2)));

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!panMode) return;
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: translate.x, origY: translate.y };
    },
    [panMode, translate]
  );
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setTranslate({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }, []);
  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Converts a client (viewport) coordinate into the floor-plan's own pixel
  // space by inverting the current translate/scale transform — the same
  // math applyFit already does forward, just in reverse.
  const clientToFloorPlanCoords = useCallback(
    (clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return null;
      const rect = viewport.getBoundingClientRect();
      return {
        x: Math.round((clientX - rect.left - translate.x) / scale),
        y: Math.round((clientY - rect.top - translate.y) / scale),
      };
    },
    [translate, scale]
  );

  function updateDeviceInState(updated: DeviceRecord) {
    onDevicesChange((list) => list.map((d) => (d.id === updated.id ? updated : d)));
  }

  // --- Edit mode: palette drag-to-create -----------------------------------

  function handlePaletteMouseDown(e: React.MouseEvent, type: string) {
    e.preventDefault();
    // The palette lives inside .map-card-viewport, so without this the
    // mousedown bubbles up to the viewport's own onMouseDown — if pan mode
    // is also on, that starts a pan drag at the same time as this palette
    // drag, moving the map and the not-yet-placed icon together.
    e.stopPropagation();
    setDraggingPaletteType(type);
    setPaletteDragPos({ x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!draggingPaletteType) return;

    function onMove(e: MouseEvent) {
      setPaletteDragPos({ x: e.clientX, y: e.clientY });
    }

    async function onUp(e: MouseEvent) {
      const type = draggingPaletteType;
      setDraggingPaletteType(null);
      setPaletteDragPos(null);
      if (!type || !locationCode) return;

      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) return;

      const coords = clientToFloorPlanCoords(e.clientX, e.clientY);
      if (!coords) return;

      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, locationCode, positionX: coords.x, positionY: coords.y }),
      }).catch(() => null);
      if (!res || !res.ok) return;
      const data = await res.json();
      const device: DeviceRecord = data.device;
      onDevicesChange((list) => [...list, device]);
      setConfigModal({ device, lockTypeAndSite: true, deleteOnCancelIfUnsaved: true });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingPaletteType, locationCode, clientToFloorPlanCoords]);

  // --- Edit mode: marker drag-to-reposition, or click-to-configure --------

  function handleDeviceMouseDown(e: React.MouseEvent, device: DeviceRecord) {
    e.stopPropagation();
    deviceDragRef.current = {
      id: device.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPosX: device.positionX ?? 0,
      startPosY: device.positionY ?? 0,
      currentPosX: device.positionX ?? 0,
      currentPosY: device.positionY ?? 0,
      moved: false,
    };
  }

  useEffect(() => {
    if (!editMode) return;

    // The final PATCH reads drag.currentPos{X,Y} off the ref directly,
    // updated synchronously here — NOT from draggingDeviceVisual state.
    // Reading the state instead is a real stale-closure trap: mouseup can
    // fire before React has re-run this effect with a fresh closure over
    // the latest state (e.g. a fast drag with few intermediate mousemoves),
    // silently sending the device's original, unmoved position.
    function onMove(e: MouseEvent) {
      const drag = deviceDragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startClientX) / scale;
      const dy = (e.clientY - drag.startClientY) / scale;
      if (Math.abs(e.clientX - drag.startClientX) > DRAG_THRESHOLD_PX || Math.abs(e.clientY - drag.startClientY) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }
      drag.currentPosX = Math.round(drag.startPosX + dx);
      drag.currentPosY = Math.round(drag.startPosY + dy);
      setDraggingDeviceVisual({ id: drag.id, x: drag.currentPosX, y: drag.currentPosY });
    }

    async function onUp() {
      const drag = deviceDragRef.current;
      deviceDragRef.current = null;
      if (!drag) return;
      setDraggingDeviceVisual(null);

      if (drag.moved) {
        const res = await fetch(`/api/devices/${drag.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positionX: drag.currentPosX, positionY: drag.currentPosY }),
        }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          updateDeviceInState(data.device);
        }
        // On failure the optimistic visual position was already cleared
        // above, so the marker just snaps back to its last-known server
        // position (still in `devices`) — nothing further to reconcile.
      } else {
        const device = devices.find((d) => d.id === drag.id);
        if (device) setConfigModal({ device, lockTypeAndSite: true, deleteOnCancelIfUnsaved: false });
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [editMode, scale, devices]);

  // --- Non-Edit-mode click behavior (BL-046) -------------------------------

  function handleDeviceClick(device: DeviceRecord) {
    const state = getDeviceState(device);
    if (state === "OFF") {
      setConfigModal({ device, lockTypeAndSite: true, deleteOnCancelIfUnsaved: false });
    } else if (state === "ACTIVE") {
      setManualSendDevice(device);
    } else {
      setInfoPanelDevice(device);
    }
  }

  if (!locationCode || loading || error || !hasMap || !map) {
    return (
      <div className="panel map-card">
        <div className="placeholder" style={{ padding: "36px 18px" }}>
          <span className="tag">Location map</span>
          <h2>
            {!locationCode
              ? "No site selected"
              : loading
                ? "Loading…"
                : error
                  ? "Couldn't load the map"
                  : "No floor plan"}
          </h2>
          <p>
            {error
              ? error
              : !locationCode || loading
                ? ""
                : "This site doesn't have a floor plan configured yet."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel map-card">
      <div
        className={`map-card-viewport${panMode ? " pannable" : ""}`}
        ref={viewportRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          className="map-card-transform"
          style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={map.mapUrl}
            alt="Floor plan"
            {...(map.width && map.height ? { width: map.width, height: map.height } : {})}
            className="map-card-image"
            draggable={false}
            onLoad={applyFit}
          />

          {zones.map((zone, i) => (
            <div
              key={zone.code ?? i}
              className="map-marker"
              style={{ left: zone.position.x, top: zone.position.y, transform: `translate(-50%, -50%) scale(${markerCounterScale})` }}
            >
              <div className="map-marker-zone-dot" title={zone.name} />
              {zone.name && <span className="map-marker-label">{zone.name}</span>}
            </div>
          ))}

          {devices
            .filter((d) => d.positionX !== null && d.positionY !== null)
            .map((device) => {
              const isDragging = draggingDeviceVisual?.id === device.id;
              const left = isDragging ? draggingDeviceVisual!.x : (device.positionX as number);
              const top = isDragging ? draggingDeviceVisual!.y : (device.positionY as number);
              return (
                <div
                  key={device.id}
                  className="map-marker"
                  style={{ left, top, transform: `translate(-50%, -50%) scale(${markerCounterScale})` }}
                >
                  <span
                    className={`map-marker-device${editMode ? " draggable" : ""}`}
                    style={{ background: `var(--device-${getDeviceState(device).toLowerCase()})`, pointerEvents: "auto" }}
                    onMouseDown={editMode ? (e) => handleDeviceMouseDown(e, device) : undefined}
                    onClick={!editMode ? () => handleDeviceClick(device) : undefined}
                  >
                    <ReadPointIcon type={device.type} size={30} title={device.name} />
                  </span>
                </div>
              );
            })}
        </div>

        {editMode && (
          <div className="device-palette">
            <div className="device-palette-label">Drag a device onto the map</div>
            <div className="device-palette-grid">
              {READ_POINT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="device-palette-item"
                  aria-label={READ_POINT_LABELS[t]}
                  data-tooltip={READ_POINT_LABELS[t]}
                  onMouseDown={(e) => handlePaletteMouseDown(e, t)}
                >
                  <ReadPointIcon type={t} size={32} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {draggingPaletteType && paletteDragPos && (
        <div className="device-drag-ghost" style={{ left: paletteDragPos.x, top: paletteDragPos.y }}>
          <ReadPointIcon type={draggingPaletteType} size={32} />
        </div>
      )}

      <div className="map-controls">
        <button className="map-control-btn" onClick={zoomIn} aria-label="Zoom in" title="Zoom in">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="9" r="6.5" />
            <line x1="14" y1="14" x2="18" y2="18" />
            <line x1="9" y1="6" x2="9" y2="12" />
            <line x1="6" y1="9" x2="12" y2="9" />
          </svg>
        </button>
        <button className="map-control-btn" onClick={zoomOut} aria-label="Zoom out" title="Zoom out">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="9" r="6.5" />
            <line x1="14" y1="14" x2="18" y2="18" />
            <line x1="6" y1="9" x2="12" y2="9" />
          </svg>
        </button>
        <button
          className={`map-control-btn${panMode ? " active" : ""}`}
          onClick={() => setPanMode((v) => !v)}
          aria-label="Toggle pan mode"
          aria-pressed={panMode}
          title="Pan"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M10 3v6M10 3l-2 2M10 3l2 2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 17v-6M10 17l-2-2M10 17l2-2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 10h6M3 10l2-2M3 10l2 2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 10h-6M17 10l-2-2M17 10l-2 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="map-control-btn" onClick={applyFit} aria-label="Fit to screen" title="Fit to screen">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 7V4a1 1 0 0 1 1-1h3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 7V4a1 1 0 0 0-1-1h-3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 13v3a1 1 0 0 0 1 1h3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 13v3a1 1 0 0 1-1 1h-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className={`map-control-btn${editMode ? " active" : ""}`}
          onClick={() => setEditMode((v) => !v)}
          aria-label="Toggle edit mode"
          aria-pressed={editMode}
          title="Edit devices"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M13.5 3.5l3 3L6 17H3v-3z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <DeviceConfigModal
        open={Boolean(configModal)}
        device={configModal?.device ?? null}
        presetType={configModal?.presetType}
        presetLocationCode={locationCode ?? undefined}
        lockTypeAndSite={configModal?.lockTypeAndSite ?? true}
        deleteOnCancelIfUnsaved={configModal?.deleteOnCancelIfUnsaved ?? false}
        siteOptions={[]}
        onClose={() => setConfigModal(null)}
        onSaved={(device) => {
          updateDeviceInState(device);
          setConfigModal(null);
        }}
        onDeleted={(id) => {
          onDevicesChange((list) => list.filter((d) => d.id !== id));
          setConfigModal(null);
        }}
      />

      {manualSendDevice && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setManualSendDevice(null)}>
          <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="manualSendTitle">
            <div className="modal-head">
              <h2 id="manualSendTitle">Manual data send</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setManualSendDevice(null)}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="note" style={{ marginTop: 0 }}>
                {manualSendDevice.name}
                {manualSendDevice.collectorId ? ` · ${manualSendDevice.collectorId}` : ""}
              </p>
              <p style={{ margin: 0, fontSize: 13 }}>Manual data send — coming soon.</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setManualSendDevice(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {infoPanelDevice && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setInfoPanelDevice(null)}>
          <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="deviceInfoTitle">
            <div className="modal-head">
              <h2 id="deviceInfoTitle">{infoPanelDevice.name}</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setInfoPanelDevice(null)}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="info-row">
                <span className="k">Collector ID</span>
                <span className="v">{infoPanelDevice.collectorId ?? "—"}</span>
              </div>
              <div className="info-row">
                <span className="k">Type</span>
                <span className="v">{READ_POINT_LABELS[infoPanelDevice.type as keyof typeof READ_POINT_LABELS] ?? infoPanelDevice.type}</span>
              </div>
              <div className="info-row">
                <span className="k">State</span>
                <span className="v">{getDeviceState(infoPanelDevice)}</span>
              </div>
              <div className="info-row">
                <span className="k">Workflow</span>
                <span className="v">
                  {infoPanelDevice.workflow ? `${infoPanelDevice.workflow.name} (${infoPanelDevice.workflow.status})` : "—"}
                </span>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setInfoPanelDevice(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
