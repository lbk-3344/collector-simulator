"use client";

import { useEffect, useRef } from "react";

// First context menu in the app (CLAUDE-CONCEPT.md 15.9 / CHARTE "Context
// menu") — right-click on an Overview-map Device marker while Edit mode is
// on. Plain fixed-position panel, dismiss/hover behaviour copied from
// UserMenu.tsx.

const MENU_W = 172;
const MENU_H = 132;

function CopyGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}
function PasteGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="12" height="14" rx="2" />
      <path d="M7.5 4V3a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 3v1" />
      <line x1="10" y1="9" x2="10" y2="14" />
      <line x1="7.5" y1="11.5" x2="12.5" y2="11.5" />
    </svg>
  );
}

export function DeviceContextMenu({
  x,
  y,
  canPaste,
  onCopy,
  onPaste,
  onDuplicate,
  onClose,
}: {
  x: number;
  y: number;
  canPaste: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    // Defer the click listener a tick so the same interaction that opened the
    // menu can't immediately close it.
    const t = setTimeout(() => document.addEventListener("click", onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Clamp so the panel never renders past the viewport's right/bottom edge.
  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - MENU_H - 8));

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div ref={ref} className="ctx-menu" style={{ left, top }} role="menu">
      <button type="button" className="ctx-menu-item" role="menuitem" onClick={run(onCopy)}>
        <CopyGlyph />
        Copy
      </button>
      <button
        type="button"
        className="ctx-menu-item"
        role="menuitem"
        disabled={!canPaste}
        onClick={canPaste ? run(onPaste) : undefined}
      >
        <PasteGlyph />
        Paste
      </button>
      <button type="button" className="ctx-menu-item" role="menuitem" onClick={run(onDuplicate)}>
        <CopyGlyph />
        Duplicate
      </button>
    </div>
  );
}
