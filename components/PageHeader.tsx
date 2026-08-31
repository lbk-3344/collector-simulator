"use client";

import { useState, type ReactNode } from "react";

// Shared list-page heading: title + an INFO disclosure (icon right of the
// title, same visual weight) whose blurb expands below, collapsed on every
// page mount (BUG #cmth5mgqy — "Info for what Item feed are", extended to
// Workflows and Devices). `action` is the top-right button slot.
export function PageHeader({
  title,
  info,
  action,
}: {
  title: string;
  info: ReactNode;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="page-heading">
      <div className="page-heading-row">
        <div className="page-heading-title">
          <h1 className="page-title" style={{ margin: 0 }}>
            {title}
          </h1>
          <button
            type="button"
            className="page-info-toggle"
            aria-expanded={open}
            aria-label={open ? "Hide info about this page" : "Show info about this page"}
            title="About this page"
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="10" cy="10" r="7.5" />
              <line x1="10" y1="9" x2="10" y2="14" />
              <circle cx="10" cy="6.3" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
        {action}
      </div>
      {open && <div className="page-info-panel fade-in">{info}</div>}
    </div>
  );
}
