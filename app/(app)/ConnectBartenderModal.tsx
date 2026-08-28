"use client";

import Link from "next/link";

// Shown on Overview when the Bartender Connection settings (tenant URL, API
// key, Track & Trace username/password) aren't fully configured yet — see
// BACKLOG.md BL-048. Reuses the same .modal-overlay/.modal pattern as
// BugReportModal.tsx.
export function ConnectBartenderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="connectBartenderTitle">
        <div className="modal-head">
          <h2 id="connectBartenderTitle">Connect to Bartender Track and Trace</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p>
            Set your tenant URL, API key, and Track &amp; Trace username/password in Settings before using the
            simulator's site and floor-plan features.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>
            Not now
          </button>
          <Link href="/settings" className="btn btn-primary">
            Go to Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
