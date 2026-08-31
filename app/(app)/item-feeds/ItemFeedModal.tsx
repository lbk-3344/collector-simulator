"use client";

import { useEffect } from "react";
import { ItemFeedForm } from "@/components/ItemFeedForm";
import type { ItemFeedRecord } from "@/lib/itemFeed";

// Thin modal wrapper around the shared ItemFeedForm.
export function ItemFeedModal({
  open,
  feed,
  onClose,
  onSaved,
  readOnly = false,
}: {
  open: boolean;
  feed: ItemFeedRecord | null;
  onClose: () => void;
  onSaved: (saved: ItemFeedRecord) => void;
  readOnly?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="itemFeedTitle" style={{ width: 540 }}>
        <div className="modal-head">
          <h2 id="itemFeedTitle">{feed ? (readOnly ? "View item feed" : "Edit item feed") : "New item feed"}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>
        <ItemFeedForm feed={feed} onCancel={onClose} onSaved={onSaved} readOnly={readOnly} />
      </div>
    </div>
  );
}
