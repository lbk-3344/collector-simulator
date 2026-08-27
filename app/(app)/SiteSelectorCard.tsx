"use client";

import { useEffect, useRef, useState } from "react";
import type { BartenderLocation } from "@/lib/bartenderLocations";

function formatMeta(loc: BartenderLocation): string {
  return [loc.city, loc.state, loc.country].filter(Boolean).join(", ");
}

// First of the four Overview top cards — see CHARTE-GRAPHIQUE.md "Site
// selector card", BACKLOG.md BL-037. Globe icon + selected site name/meta,
// clickable name opens a dropdown listing every other Location.
export function SiteSelectorCard({
  locations,
  selectedCode,
  onSelect,
  error,
}: {
  locations: BartenderLocation[] | null;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const selected = locations?.find((l) => l.code === selectedCode) ?? null;

  return (
    <div className="stat-card site-card">
      <div className="site-card-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <ellipse cx="10" cy="10" rx="3.4" ry="8" />
          <line x1="2" y1="10" x2="18" y2="10" />
          <path d="M3.5 5.5c1.6 1 3.5 1.5 6.5 1.5s4.9-.5 6.5-1.5" />
          <path d="M3.5 14.5c1.6-1 3.5-1.5 6.5-1.5s4.9.5 6.5 1.5" />
        </svg>
      </div>

      <div className="site-card-body" ref={rootRef}>
        {error ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--danger)" }}>Couldn&apos;t load sites</div>
            <div className="site-card-meta">{error}</div>
          </>
        ) : !locations ? (
          <div style={{ fontSize: 14, color: "var(--ink-2)" }}>Loading sites…</div>
        ) : !selected ? (
          <div style={{ fontSize: 14, color: "var(--ink-2)" }}>No sites available</div>
        ) : (
          <>
            <button
              type="button"
              className="site-card-name-btn"
              aria-haspopup="true"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span>{selected.name}</span>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polyline points="5,7.5 10,12.5 15,7.5" />
              </svg>
            </button>
            <div className="site-card-meta">{formatMeta(selected) || selected.code}</div>

            {open && (
              <div className="site-card-dropdown">
                {locations.map((loc) => (
                  <button
                    key={loc.code}
                    type="button"
                    className={`site-card-dropdown-item${loc.code === selectedCode ? " active" : ""}`}
                    onClick={() => {
                      onSelect(loc.code);
                      setOpen(false);
                    }}
                  >
                    {loc.name}
                    <span className="meta">{formatMeta(loc) || loc.code}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
