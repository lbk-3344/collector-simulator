"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReadPointIcon, { READ_POINT_TYPES, READ_POINT_LABELS } from "@/components/ui/ReadPointIcon";
import { DeviceConfigModal } from "@/components/DeviceConfigModal";
import { ContextMenu } from "@/components/ContextMenu";
import { PadlockIcon } from "@/components/SharedBadge";
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
  // Opened just to inspect a shared-not-owned device (BL-068) — every field
  // shown, all inert, footer is a single Close.
  readOnly?: boolean;
};

export interface LocationMapCardProps {
  locationCode: string | null;
  // Devices are owned by OverviewClient (not fetched here) so Edit-mode
  // changes made on the map immediately reflect in the "Devices online" KPI
  // card too — see BACKLOG.md BL-042 to BL-047.
  devices: DeviceRecord[];
  // Session user id (BL-068) — a marker whose device.ownerId differs is
  // visible only because it's shared, and is read-only on the map.
  currentUserId: string | null;
  onDevicesChange: (update: DeviceRecord[] | ((prev: DeviceRecord[]) => DeviceRecord[])) => void;
}

// Replaces the placeholder panel beneath the KPI row — see
// CHARTE-GRAPHIQUE.md "Location map card", BACKLOG.md BL-038. Fetches the
// selected site's floor plan + zones; renders them, plus the caller-owned
// devices, as absolutely-positioned markers inside a scale/translate
// transform layer so they stay correctly placed at any zoom. Edit mode
// (BL-044) and non-Edit-mode click behavior (BL-046) both live here since
// both act on the same device markers.
export function LocationMapCard({ locationCode, devices, currentUserId, onDevicesChange }: LocationMapCardProps) {
  // A device visible only because it's shared (not owned) — read-only:
  // no reposition drag, no editable config modal. Copy/Duplicate stay
  // available (they don't mutate the shared record — §17.3).
  const isReadOnly = (d: DeviceRecord) => currentUserId != null && d.ownerId !== currentUserId;

  // Devices with no map coords yet — duplicated from the Devices list, or
  // their Site was just changed (which clears the old coords, route side).
  // Instead of hiding them, stage them in a column near the floor plan's
  // top-left so Edit mode can drag each into place.
  const unplacedIds = devices.filter((d) => d.positionX == null || d.positionY == null).map((d) => d.id);
  const displayPos = (d: DeviceRecord): { x: number; y: number } => {
    if (d.positionX != null && d.positionY != null) return { x: d.positionX, y: d.positionY };
    // Staging tray, top-left of the floor plan — a loose 4-wide grid so
    // several unplaced devices don't stack on one spot.
    const i = Math.max(0, unplacedIds.indexOf(d.id));
    return { x: 56 + (i % 4) * 60, y: 56 + Math.floor(i / 4) * 60 };
  };
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
  // BL-074 — the Ready/Offline modal's own inline error + in-flight flag
  // (can't reuse `error` above, which swaps the whole card for a placeholder).
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);

  // Edit-mode right-click menu (BL-066). `deviceClipboard` is plain state,
  // same lifetime as `editMode` — gone on reload, survives repeated pastes.
  const [deviceClipboard, setDeviceClipboard] = useState<DeviceRecord | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; device: DeviceRecord } | null>(null);

  // Fits the whole floor plan inside the card's viewport — floor plans can be
  // thousands of pixels wide (see CLAUDE-CONCEPT.md section 7.4), so showing
  // them at native size on load left most of the map off-screen. Also used
  // by the "Fit to screen" control to recenter after panning/zooming.
  //
  // The fit leaves a safe inset between the floor-plan edge and the viewport
  // edge so markers sitting right on the plan's border stay fully visible:
  // ~half a device-icon height up top, and more on the sides / bottom where
  // a Zone's name label (centred under its dot, `white-space: nowrap`) can
  // extend well past the marker itself. Fixed px (markers are screen-constant
  // via their counter-scale), clamped so it can't eat a small viewport.
  const applyFit = useCallback(() => {
    const img = imgRef.current;
    const viewport = viewportRef.current;
    if (!img || !viewport || !img.naturalWidth || !img.naturalHeight) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const padTop = Math.min(18, vh * 0.15);
    const padBottom = Math.min(40, vh * 0.15);
    const padX = Math.min(64, vw * 0.12);

    const availW = Math.max(1, vw - padX * 2);
    const availH = Math.max(1, vh - padTop - padBottom);
    const fit = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
    setMinScale(fit);
    setScale(fit);
    setTranslate({
      x: padX + (availW - img.naturalWidth * fit) / 2,
      y: padTop + (availH - img.naturalHeight * fit) / 2,
    });
  }, []);

  useEffect(() => {
    if (!locationCode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScale(1);
    setTranslate({ x: 0, y: 0 });
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

  // Pan on a plain left-drag of the map background — the panMode toggle is no
  // longer required (BUG #13, matching the workflow canvas). Edit-mode marker
  // drags call stopPropagation before this fires; a click that doesn't move
  // changes nothing, so a marker's own onClick still runs.
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: translate.x, origY: translate.y };
    },
    [translate]
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

  // Mouse-wheel zoom toward the cursor (BUG #13). Native non-passive listener
  // so preventDefault() actually stops the page from scrolling — React's
  // synthetic onWheel is passive.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(minScale, Math.min(MAX_SCALE, scale * factor));
      if (Math.abs(next - scale) < 0.0005) return;
      const ratio = next / scale;
      setTranslate({ x: px - (px - translate.x) * ratio, y: py - (py - translate.y) * ratio });
      setScale(+next.toFixed(3));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [scale, translate, minScale]);

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

  // Manual OFFLINE toggle from the Ready/Offline modal (BL-074).
  async function handleOfflineToggle(device: DeviceRecord, offline: boolean) {
    setOfflineBusy(true);
    setOfflineError(null);
    const res = await fetch(`/api/devices/${device.id}/offline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offline }),
    });
    setOfflineBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setOfflineError(data?.error ?? "Couldn't change this device's status.");
      return;
    }
    const data = await res.json();
    updateDeviceInState(data.device as DeviceRecord);
    setManualSendDevice(null);
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
    // Left button only — a right-click (button 2) must not arm the
    // drag/click-to-configure ref, otherwise its mouseup opens the config
    // modal on top of the context menu (BL-066 follow-up). The context menu
    // is handled entirely by onContextMenu.
    if (e.button !== 0) return;
    // Shared-not-owned devices are read-only — no reposition drag. A plain
    // click still opens the config window read-only so it can be inspected
    // as a model (BL-068 follow-up).
    if (isReadOnly(device)) {
      setConfigModal({ device, lockTypeAndSite: true, deleteOnCancelIfUnsaved: false, readOnly: true });
      return;
    }
    // Start the drag from where the marker actually sits — its real coords,
    // or its staged position if it's not placed yet (else an unplaced drag
    // would jump from 0,0).
    const p0 = displayPos(device);
    deviceDragRef.current = {
      id: device.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPosX: p0.x,
      startPosY: p0.y,
      currentPosX: p0.x,
      currentPosY: p0.y,
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

  // --- Edit mode: right-click Copy / Paste / Duplicate (BL-066) -----------

  function handleDeviceContextMenu(e: React.MouseEvent, device: DeviceRecord) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, device });
  }

  // Shared by the menu's Paste (clipboard device, cursor position) and
  // Duplicate (right-clicked device, +24/+24 offset). Adds the returned clone
  // to the caller-owned devices list; no config modal opens.
  async function duplicateDevice(sourceId: string, positionX: number | null, positionY: number | null) {
    const res = await fetch(`/api/devices/${sourceId}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionX, positionY }),
    }).catch(() => null);
    if (!res || !res.ok) return;
    const data = await res.json();
    onDevicesChange((list) => [...list, data.device as DeviceRecord]);
  }

  // --- Non-Edit-mode click behavior (BL-046) -------------------------------

  function handleDeviceClick(device: DeviceRecord) {
    // A shared-not-owned device opens the full config window read-only, so
    // it can be inspected as a model (BL-068 follow-up) — every field
    // visible, nothing editable, whatever its state.
    if (isReadOnly(device)) {
      setConfigModal({ device, lockTypeAndSite: true, deleteOnCancelIfUnsaved: false, readOnly: true });
      return;
    }
    const state = getDeviceState(device);
    if (state === "PENDING") {
      setConfigModal({ device, lockTypeAndSite: true, deleteOnCancelIfUnsaved: false });
    } else if (state === "READY" || state === "OFFLINE") {
      // One modal for both — it branches on the live state inside (BL-074).
      setManualSendDevice(device);
    } else {
      // ACTIVE only, now that PROBLEM is gone.
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
        className={`map-card-viewport`}
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

          {devices.map((device) => {
              const isDragging = draggingDeviceVisual?.id === device.id;
              const base = displayPos(device);
              const left = isDragging ? draggingDeviceVisual!.x : base.x;
              const top = isDragging ? draggingDeviceVisual!.y : base.y;
              const unplaced = device.positionX == null || device.positionY == null;
              const readOnly = isReadOnly(device);
              return (
                <div
                  key={device.id}
                  className="map-marker"
                  style={{ left, top, transform: `translate(-50%, -50%) scale(${markerCounterScale})` }}
                >
                  <span
                    className={`map-marker-device${editMode && !readOnly ? " draggable" : ""}${unplaced ? " unplaced" : ""}`}
                    data-state={getDeviceState(device).toLowerCase()}
                    style={{ background: `var(--device-${getDeviceState(device).toLowerCase()})`, pointerEvents: "auto", position: "relative" }}
                    title={unplaced ? `${device.name} — not placed on this map yet; drag it into position in Edit mode` : undefined}
                    onMouseDown={editMode ? (e) => handleDeviceMouseDown(e, device) : undefined}
                    onClick={!editMode ? () => handleDeviceClick(device) : undefined}
                    onContextMenu={editMode ? (e) => handleDeviceContextMenu(e, device) : undefined}
                  >
                    <ReadPointIcon type={device.type} size={30} title={device.name} />
                    {readOnly && (
                      <span className="map-marker-shared" title="Shared with you — read-only">
                        <PadlockIcon />
                      </span>
                    )}
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
        readOnly={configModal?.readOnly ?? false}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canPaste={deviceClipboard !== null}
          onCopy={() => setDeviceClipboard(contextMenu.device)}
          onPaste={() => {
            const c = clientToFloorPlanCoords(contextMenu.x, contextMenu.y);
            if (deviceClipboard && c) duplicateDevice(deviceClipboard.id, c.x, c.y);
          }}
          onDuplicate={() =>
            duplicateDevice(
              contextMenu.device.id,
              (contextMenu.device.positionX ?? 0) + 24,
              (contextMenu.device.positionY ?? 0) + 24
            )
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {manualSendDevice &&
        (() => {
          const isOffline = getDeviceState(manualSendDevice) === "OFFLINE";
          const close = () => {
            setManualSendDevice(null);
            setOfflineError(null);
          };
          return (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
              <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="manualSendTitle">
                <div className="modal-head">
                  <h2 id="manualSendTitle">{isOffline ? "Device offline" : "Manual data send"}</h2>
                  <button className="modal-close" aria-label="Close" onClick={close}>
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
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {isOffline
                      ? "This device is offline — heartbeat and manual send are paused."
                      : "Manual data send — coming soon."}
                  </p>
                  {offlineError && (
                    <div className="snack snack-danger" style={{ marginTop: 12, marginBottom: 0 }}>
                      {offlineError}
                    </div>
                  )}
                </div>
                <div className="modal-foot">
                  <button className="btn btn-secondary" onClick={close}>
                    Close
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={offlineBusy}
                    onClick={() => handleOfflineToggle(manualSendDevice, !isOffline)}
                  >
                    {isOffline ? "Turn device on" : "Turn device offline"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

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
                <span className="v">Active</span>
              </div>
              <div className="info-row">
                <span className="k">Workflow</span>
                <span className="v">
                  {infoPanelDevice.task?.workflow
                    ? `${infoPanelDevice.task.workflow.name} (${infoPanelDevice.task.workflow.status})`
                    : "—"}
                </span>
              </div>
              <p className="note" style={{ marginBottom: 0 }}>
                Stop the workflow to take this device offline.
              </p>
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
