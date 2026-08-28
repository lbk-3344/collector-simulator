"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReadPointIcon from "@/components/ui/ReadPointIcon";
import type { LocationMap, LocationZone } from "@/lib/bartenderLocations";

type ApiDevice = {
  id: string;
  name: string;
  type: string;
  positionX: number | null;
  positionY: number | null;
  status: "ONLINE" | "OFFLINE";
};

const MAX_SCALE = 6;
const SCALE_STEP = 0.2;

// Replaces the placeholder panel beneath the KPI row — see
// CHARTE-GRAPHIQUE.md "Location map card", BACKLOG.md BL-038. Fetches the
// selected site's floor plan + zones + this app's own simulated devices in
// parallel; renders them as absolutely-positioned markers inside a
// scale/translate transform layer so they stay correctly placed at any zoom.
export function LocationMapCard({ locationCode }: { locationCode: string | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMap, setHasMap] = useState(false);
  const [map, setMap] = useState<LocationMap | null>(null);
  const [zones, setZones] = useState<LocationZone[]>([]);
  const [devices, setDevices] = useState<ApiDevice[]>([]);

  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

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

    async function load() {
      try {
        const [mapRes, zonesRes, devicesRes] = await Promise.all([
          fetch(`/api/locations/${encodeURIComponent(locationCode as string)}/map`),
          fetch(`/api/locations/${encodeURIComponent(locationCode as string)}/zones`),
          fetch(`/api/devices?locationCode=${encodeURIComponent(locationCode as string)}`),
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

        const devicesData = devicesRes.ok ? await devicesRes.json().catch(() => null) : null;
        setDevices(devicesData?.devices ?? []);
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
            <div key={zone.code ?? i} className="map-marker" style={{ left: zone.position.x, top: zone.position.y }}>
              <div className="map-marker-zone-dot" title={zone.name} />
              {zone.name && <span className="map-marker-label">{zone.name}</span>}
            </div>
          ))}

          {devices
            .filter((d) => d.positionX !== null && d.positionY !== null)
            .map((device) => (
              <div key={device.id} className="map-marker" style={{ left: device.positionX as number, top: device.positionY as number }}>
                <span className={`map-marker-device${device.status === "OFFLINE" ? " offline" : ""}`}>
                  <ReadPointIcon type={device.type} size={20} title={device.name} />
                </span>
              </div>
            ))}
        </div>
      </div>

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
      </div>
    </div>
  );
}
