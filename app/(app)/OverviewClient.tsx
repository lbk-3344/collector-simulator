"use client";

import { useEffect, useState } from "react";
import { SiteSelectorCard } from "./SiteSelectorCard";
import { LocationMapCard } from "./LocationMapCard";
import { ConnectBartenderModal } from "./ConnectBartenderModal";
import { getDeviceState } from "@/lib/deviceState";
import type { DeviceRecord } from "@/lib/deviceConfig";
import type { BartenderLocation } from "@/lib/bartenderLocations";

// Orchestrates the Overview page's site selection + KPI cards — see
// CLAUDE-CONCEPT.md section 14, BACKLOG.md BL-037/BL-039. Lifts the selected
// location code up so both the site selector and the map card react to it.
export function OverviewClient({ initialSelectedLocationCode }: { initialSelectedLocationCode: string | null }) {
  const [locations, setLocations] = useState<BartenderLocation[] | null>(null);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  // Owned here (not inside LocationMapCard) so Edit-mode changes made on the
  // map — create/reposition/reconfigure — immediately reflect in the KPI
  // card too, via the same onDevicesChange setter passed down.
  const [devices, setDevices] = useState<DeviceRecord[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  // Tenant-global KPIs (not site-scoped) — CLAUDE-CONCEPT.md §14.4.
  const [stats, setStats] = useState<{
    workflows: { running: number; total: number };
    itemsGenerated24h: number;
  } | null>(null);

  // Nudges the user to Settings if any of the four Bartender credential
  // fields aren't set yet — see BACKLOG.md BL-048.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/bartender")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const missing = !data.tenantUrl || !data.apiKeyLast4 || !data.username || !data.hasPassword;
        if (missing) setShowConnectModal(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/locations");
      if (cancelled) return;
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setLocationsError(data?.error ?? "Couldn't load sites.");
        return;
      }
      const data = await res.json();
      const list: BartenderLocation[] = data.locations ?? [];
      setLocations(list);
      const preferred = initialSelectedLocationCode && list.find((l) => l.code === initialSelectedLocationCode);
      setSelectedCode(preferred ? preferred.code : (list[0]?.code ?? null));
    }
    load();
    return () => {
      cancelled = true;
    };
    // Only ever runs once on mount — initialSelectedLocationCode is the
    // server-rendered starting value, not meant to re-trigger this fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // KPI stats: load on mount, then refresh every 30s so "Workflows running"
  // and "Items generated" track the run engine without a page reload.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/overview/stats")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) setStats(data);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!selectedCode) {
      setDevices(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/devices?locationCode=${encodeURIComponent(selectedCode)}`)
      .then((res) => (res.ok ? res.json() : { devices: [] }))
      .then((data) => {
        if (cancelled) return;
        setDevices(data.devices ?? []);
        if (data.currentUserId) setCurrentUserId(data.currentUserId);
      })
      .catch(() => {
        if (!cancelled) setDevices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCode]);

  async function handleSelect(code: string) {
    setSelectedCode(code);
    await fetch("/api/settings/selected-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationCode: code }),
    }).catch(() => {});
  }

  // "Devices online" counts every configured+published Device — Ready,
  // Active, or (manually) Offline — out of the site total. See
  // CLAUDE-CONCEPT.md §15.3; unchanged in spirit from BL-039's original
  // "configured, regardless of workflow", just spanning the renamed states.
  const onlineCount =
    devices?.filter((d) => ["READY", "ACTIVE", "OFFLINE"].includes(getDeviceState(d))).length ?? 0;
  const totalCount = devices?.length ?? 0;

  return (
    <>
      <div className="stat-grid">
        <SiteSelectorCard
          locations={locations}
          selectedCode={selectedCode}
          onSelect={handleSelect}
          error={locationsError}
        />
        <div className="stat-card accent">
          <div className="l">Devices online</div>
          <div className="n">{devices ? `${onlineCount} / ${totalCount}` : "— / —"}</div>
          <div className="d">
            {!selectedCode
              ? "no site selected"
              : !devices
                ? "loading…"
                : totalCount === 0
                  ? "no devices simulated yet"
                  : "at selected site"}
          </div>
        </div>
        <div className="stat-card">
          <div className="l">Workflows running</div>
          <div className="n">{stats ? `${stats.workflows.running} / ${stats.workflows.total}` : "— / —"}</div>
          <div className="d">
            {!stats
              ? "loading…"
              : stats.workflows.total === 0
                ? "no workflows yet"
                : "running / total"}
          </div>
        </div>
        <div className="stat-card">
          <div className="l">Items generated</div>
          <div className="n">{stats ? stats.itemsGenerated24h.toLocaleString() : "—"}</div>
          <div className="d">{!stats ? "loading…" : "last 24h"}</div>
        </div>
      </div>

      <LocationMapCard
        locationCode={selectedCode}
        devices={devices ?? []}
        currentUserId={currentUserId}
        onDevicesChange={(update) =>
          setDevices((prev) => (typeof update === "function" ? update(prev ?? []) : update))
        }
      />

      <ConnectBartenderModal open={showConnectModal} onClose={() => setShowConnectModal(false)} />
    </>
  );
}
