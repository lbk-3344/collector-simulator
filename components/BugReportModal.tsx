"use client";

import { useEffect, useState } from "react";

// Modal form for "Report a bug" (avatar menu) — opens from anywhere without
// navigating away. See CLAUDE-CONCEPT.md section 3. Screenshot upload
// (Cloudinary) is BL-008, a later backlog item — the attach button is a
// disabled placeholder for now.
export function BugReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 4000);
    return () => clearTimeout(t);
  }, [showToast]);

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong");
      }
      setTitle("");
      setDescription("");
      onClose();
      setShowToast(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="bugModalTitle">
            <div className="modal-head">
              <h2 id="bugModalTitle">Report a bug</h2>
              <button className="modal-close" aria-label="Close" onClick={onClose}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="error-banner">{error}</div>}
              <div className="field-block">
                <label htmlFor="bugTitle">Title</label>
                <input
                  id="bugTitle"
                  type="text"
                  placeholder="e.g. Label Printer stuck in Idle after a run"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="field-block">
                <label htmlFor="bugDesc">Description</label>
                <textarea
                  id="bugDesc"
                  rows={4}
                  placeholder="What happened, and what did you expect instead?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <button className="attach-btn" type="button" disabled title="Screenshot upload isn't wired up yet — see BACKLOG.md BL-008">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="3" y="3" width="14" height="14" rx="2" />
                  <circle cx="7.3" cy="7.3" r="1.3" />
                  <path d="M4 14.5l4-4 2.5 2.5 3-3.5 2.5 3" strokeLinejoin="round" />
                </svg>
                Attach a screenshot
              </button>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showToast && (
        <div className="toast">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="10" cy="10" r="7.5" />
            <polyline points="6.5,10.2 8.8,12.5 13.5,7.5" />
          </svg>
          <div>
            <strong>Bug reported.</strong> We&apos;ll email you once it&apos;s resolved.
          </div>
        </div>
      )}
    </>
  );
}
