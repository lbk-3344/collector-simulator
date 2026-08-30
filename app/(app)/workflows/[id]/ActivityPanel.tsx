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

// Plain run/activity log (BL-061 Phase 5) — recent simulated reads, newest
// first, polled every 5s while open. No token animation, per Luc.
export function ActivityPanel({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
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

  return (
    <aside className="wf-activity">
      <div className="wf-activity-head">
        <span>Activity</span>
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
            <line x1="5" y1="5" x2="15" y2="15" />
            <line x1="15" y1="5" x2="5" y2="15" />
          </svg>
        </button>
      </div>
      <div className="wf-activity-body">
        {!reads ? (
          <p className="note">Loading…</p>
        ) : reads.length === 0 ? (
          <p className="note">No reads yet. Run the workflow and wait for an entry channel to fire.</p>
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
    </aside>
  );
}
