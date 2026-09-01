"use client";

import { useEffect, useRef } from "react";

// Generic right-click context menu (CLAUDE-CONCEPT.md 15.9 / 16.9, CHARTE
// "Context menu"). Every action is optional — only the rows whose handler is
// passed are rendered. Used for Overview-map Device markers (BL-066),
// Workflow-canvas Feed Nodes (BL-071), Task nodes and links (BUG #14).

const MENU_W = 176;
const ROW_H = 36;

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
function CutGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="14" r="2.5" />
      <circle cx="14.5" cy="14" r="2.5" />
      <path d="M7.5 12 16 3M12.5 12 4 3" />
    </svg>
  );
}
function TrashGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M5.5 6 6.2 16a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6M8.3 9v5M11.7 9v5" />
    </svg>
  );
}

export function ContextMenu({
  x,
  y,
  canPaste = false,
  onCopy,
  onPaste,
  onCut,
  onDuplicate,
  onDelete,
  copyLabel = "Copy",
  pasteLabel = "Paste",
  cutLabel = "Cut",
  duplicateLabel = "Duplicate",
  deleteLabel = "Delete",
  onClose,
}: {
  x: number;
  y: number;
  canPaste?: boolean;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
  onDuplicate?: () => void;
  // Optional destructive row, rendered under a separator.
  onDelete?: () => void;
  copyLabel?: string;
  pasteLabel?: string;
  cutLabel?: string;
  duplicateLabel?: string;
  deleteLabel?: string;
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

  const topRows = [onCopy, onCut, onPaste, onDuplicate].filter(Boolean).length;
  const menuH = topRows * ROW_H + (onDelete ? ROW_H + 9 : 0) + 12;
  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div ref={ref} className="ctx-menu" style={{ left, top }} role="menu">
      {onCopy && (
        <button type="button" className="ctx-menu-item" role="menuitem" onClick={run(onCopy)}>
          <CopyGlyph />
          {copyLabel}
        </button>
      )}
      {onCut && (
        <button type="button" className="ctx-menu-item" role="menuitem" onClick={run(onCut)}>
          <CutGlyph />
          {cutLabel}
        </button>
      )}
      {onPaste && (
        <button
          type="button"
          className="ctx-menu-item"
          role="menuitem"
          disabled={!canPaste}
          onClick={canPaste ? run(onPaste) : undefined}
        >
          <PasteGlyph />
          {pasteLabel}
        </button>
      )}
      {onDuplicate && (
        <button type="button" className="ctx-menu-item" role="menuitem" onClick={run(onDuplicate)}>
          <CopyGlyph />
          {duplicateLabel}
        </button>
      )}
      {onDelete && (
        <>
          {topRows > 0 && <div className="ctx-menu-sep" role="separator" />}
          <button type="button" className="ctx-menu-item danger" role="menuitem" onClick={run(onDelete)}>
            <TrashGlyph />
            {deleteLabel}
          </button>
        </>
      )}
    </div>
  );
}
