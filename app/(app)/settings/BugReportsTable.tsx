"use client";

import { useCallback, useEffect, useState } from "react";

type ApiBug = {
  id: string;
  number: number;
  title: string;
  description: string;
  screenshotUrl: string | null;
  reportedAt: string;
  reporter: { name: string | null; email: string };
};

function formatReported(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Admin-only, read-only list of currently OPEN bug reports — not part of the
// resolve/notify workflow (see CLAUDE.md "Bug handling"), just a way to
// actually see what's outstanding without running bugs:export.
export function BugReportsTable() {
  const [bugs, setBugs] = useState<ApiBug[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiBug | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/bugs");
    if (!res.ok) {
      setError("Couldn't load bug reports.");
      return;
    }
    const data = await res.json();
    setBugs(data.bugs ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  if (!bugs) {
    return <p className="note">Loading bug reports…</p>;
  }

  return (
    <>
      {error && <div className="snack snack-danger">{error}</div>}

      {bugs.length === 0 ? (
        <p className="note">No open bug reports right now.</p>
      ) : (
        <div className="table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th>Bug</th>
                <th>Reported by</th>
                <th>Reported</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bugs.map((bug) => (
                <tr key={bug.id}>
                  <td>
                    <div className="u-name">
                      <span className="u-meta" style={{ marginRight: 6 }}>#{bug.number}</span>
                      {bug.title}
                    </div>
                  </td>
                  <td>
                    <div className="u-name">{bug.reporter.name ?? "—"}</div>
                    <div className="u-email">{bug.reporter.email}</div>
                  </td>
                  <td className="u-meta">{formatReported(bug.reportedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary small" onClick={() => setSelected(bug)}>
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="bugDetailTitle">
            <div className="modal-head">
              <h2 id="bugDetailTitle">#{selected.number} — {selected.title}</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setSelected(null)}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="note" style={{ marginTop: 0 }}>
                {selected.reporter.name ?? selected.reporter.email} &middot; {formatReported(selected.reportedAt)}
              </p>
              <div className="field-block">
                <label>Description</label>
                <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{selected.description}</p>
              </div>
              {selected.screenshotUrl ? (
                <div className="field-block">
                  <label>Screenshot</label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.screenshotUrl}
                    alt={`Screenshot for ${selected.title}`}
                    style={{ maxWidth: "100%", borderRadius: 7, border: "1px solid var(--border-strong)" }}
                  />
                </div>
              ) : (
                <p className="note">No screenshot attached.</p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
