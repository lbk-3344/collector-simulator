"use client";

import { useState } from "react";
import { ProductPicker } from "@/components/ProductPicker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Link = any;

export interface EdgePatch {
  delayMinSeconds: number;
  delayMaxSeconds: number;
  filterGtins: string[] | null;
  isElse: boolean;
}

// Inline panel opened from an edge's label chip — delay range, GTIN filter,
// and the "else / catch-all" toggle (at most one per source Task+Channel,
// enforced here before save).
export function EdgeConfigPanel({
  link,
  siblingElseCount,
  onClose,
  onSave,
  onDelete,
  readOnly = false,
}: {
  link: Link;
  siblingElseCount: number;
  onClose: () => void;
  onSave: (body: EdgePatch) => void;
  onDelete: () => void;
  // True when the workflow is shared with the current user (BL-068) — every
  // field shown, all inert, footer is a single Close.
  readOnly?: boolean;
}) {
  const [delayMin, setDelayMin] = useState<number>(link?.delayMinSeconds ?? 0);
  const [delayMax, setDelayMax] = useState<number>(link?.delayMaxSeconds ?? 0);
  const [gtins, setGtins] = useState<string[]>(Array.isArray(link?.filterGtins) ? link.filterGtins : []);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [isElse, setIsElse] = useState<boolean>(Boolean(link?.isElse));
  const [error, setError] = useState<string | null>(null);

  if (!link) return null;

  function save() {
    if (isElse && !link.isElse && siblingElseCount > 0) {
      setError("This source channel already has an 'else' edge — only one is allowed.");
      return;
    }
    onSave({
      delayMinSeconds: Math.max(0, Math.round(delayMin)),
      delayMaxSeconds: Math.max(0, Math.round(delayMax)),
      filterGtins: isElse || gtins.length === 0 ? null : gtins,
      isElse,
    });
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" role="dialog" aria-modal="true" style={{ width: 440 }}>
        <div className="modal-head">
          <h2>Flow link</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {readOnly && <div className="snack snack-info">Shared with you — read-only.</div>}
          <fieldset className="modal-fields" disabled={readOnly}>
          {error && <div className="snack snack-danger">{error}</div>}
          <div className="field-row">
            <div className="field-block">
              <label htmlFor="dMin">Delay min (s)</label>
              <input id="dMin" type="number" min={0} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value) || 0)} />
            </div>
            <div className="field-block">
              <label htmlFor="dMax">Delay max (s)</label>
              <input id="dMax" type="number" min={0} value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value) || 0)} />
            </div>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={isElse} onChange={(e) => setIsElse(e.target.checked)} />
            Else / catch-all (takes anything no other edge from this channel claims)
          </label>
          {!isElse && (
            <div className="field-block">
              <label>GTIN filter</label>
              <span className="note" style={{ marginBottom: 6 }}>
                Only items whose GTIN is in this list take this edge. Empty = every item.
              </span>
              <ProductPicker
                gtins={gtins}
                categoryCode={filterCategory}
                onChange={({ gtins: g, categoryCode: c }) => {
                  setGtins(g);
                  setFilterCategory(c);
                }}
              />
            </div>
          )}
          </fieldset>
        </div>
        <div className="modal-foot">
          {readOnly ? (
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          ) : (
            <>
              <button className="btn btn-ghost-danger" onClick={onDelete}>
                Delete link
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save}>
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
