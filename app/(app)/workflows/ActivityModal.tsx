"use client";

import { useEffect, useState } from "react";

interface ReadRow {
  id: string;
  taskName: string;
  channelId: string;
  itemCount: number;
  gtin: string | null;
  occurredAt: string;
}

// Bug #7 (2026-09-01): the Workflows list's own Activity icon — same reads
// feed as the canvas's ActivityPanel ([id]/ActivityPanel.tsx), but shown in a
// modal rather than a docked flex panel, since the list page has no canvas
// layout to dock into. Reuses the .wf-activity-table row styling.
export function ActivityModal({
  workflowId,
  workflowName,
  onClose,
}: {
  workflowId: string;
  workflowName: string;
  onClose: () => void;
}) {
  const [reads, setReads] = useState<ReadRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchReads = () =>
      fetch(`/api/workflows/${workflowId}/reads?limit=150`)
        .then((r) => (r.ok ? r.json() : { reads: [] }))
        .then((d) => !cancelled && setReads(d.reads ?? []))
        .catch(() => {});
    fetchReads();
    const t = setInterval(fetchReads, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [workflowId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="activityModalTitle" style={{ width: 460 }}>
        <div className="modal-head">
          <h2 id="activityModalTitle">Activity — {workflowName}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>
        <div className="modal-body" style={{ padding: 0, maxHeight: "60vh", overflowY: "auto" }}>
          {!reads ? (
            <p className="note" style={{ margin: 12 }}>
              Loading…
            </p>
          ) : reads.length === 0 ? (
            <p className="note" style={{ margin: 12 }}>
              No reads yet. Run the workflow and wait for an entry channel to fire.
            </p>
          ) : (
            <table className="wf-activity-table">
              <tbody>
                {reads.map((r) => (
                  <tr key={r.id}>
                    <td className="wf-activity-time">{new Date(r.occurredAt).toLocaleTimeString()}</td>
                    <td>
                      <div className="wf-activity-task">
                        {r.taskName} · {r.channelId}
                      </div>
                      <div className="wf-activity-meta">
                        {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
                        {r.gtin ? ` · ${r.gtin}` : ""}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
