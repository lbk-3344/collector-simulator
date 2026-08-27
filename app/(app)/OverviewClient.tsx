"use client";

import { useEffect, useState } from "react";
import { SiteSelectorCard } from "./SiteSelectorCard";
import { LocationMapCard } from "./LocationMapCard";
import type { BartenderLocation } from "@/lib/bartenderLocations";

type ApiDevice = { id: string; status: "ONLINE" | "OFFLINE" };

// Orchestrates the Overview page's site selection + KPI cards — see
// CLAUDE-CONCEPT.md section 14, BACKLOG.md BL-037/BL-039. Lifts the selected
// location code up so both the site selector and the map card react to it.
export function OverviewClient({ initialSelectedLocationCode }: { initialSelectedLocationCode: string | null }) {
  const [locations, setLocations] = useState<BartenderLocation[] | null>(null);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [devices, setDevices] = useState<ApiDevice[] | null>(null);

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

  useEffect(() => {
    if (!selectedCode) {
      setDevices(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/devices?locationCode=${encodeURIComponent(selectedCode)}`)
      .then((res) => (res.ok ? res.json() : { devices: [] }))
      .then((data) => {
        if (!cancelled) setDevices(data.devices ?? []);
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

  const onlineCount = devices?.filter((d) => d.status === "ONLINE").length ?? 0;
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
          <div className="n">0</div>
          <div className="d">not built yet</div>
        </div>
        <div className="stat-card">
          <div className="l">Items generated</div>
          <div className="n">0</div>
          <div className="d">last 24h</div>
        </div>
      </div>

      <LocationMapCard locationCode={selectedCode} />
    </>
  );
}
