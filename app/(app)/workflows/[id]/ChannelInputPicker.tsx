"use client";

import { useState } from "react";
import type { ItemFeedRecord } from "@/lib/itemFeed";

interface CurrentInput {
  inputType: "ITEM_FEED" | "FLOW_LINK" | "NONE";
  itemFeedId?: string | null;
  fireIntervalSeconds?: number | null;
}

export interface ChannelInputPayload {
  inputType: "ITEM_FEED" | "NONE";
  itemFeedId?: string | null;
  fireIntervalSeconds?: number | null;
}

// Small modal for assigning one Channel's input: an Item Feed (with a fire
// interval) or "none". Flow-Link inputs are set by drawing an edge, not here.
export function ChannelInputPicker({
  feeds,
  current,
  onNewFeed,
  onClose,
  onSave,
}: {
  feeds: ItemFeedRecord[];
  current: CurrentInput | null;
  onNewFeed: () => void;
  onClose: () => void;
  onSave: (payload: ChannelInputPayload) => void;
}) {
  const [itemFeedId, setItemFeedId] = useState(current?.itemFeedId ?? "");
  const [interval, setInterval] = useState(current?.fireIntervalSeconds ?? 60);

  const isFlowLink = current?.inputType === "FLOW_LINK";

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" role="dialog" aria-modal="true" style={{ width: 420 }}>
        <div className="modal-head">
          <h2>Channel input</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {isFlowLink && (
            <div className="snack snack-warning">
              This channel currently receives from flow links. Picking an item feed here will replace that.
            </div>
          )}
          <div className="field-block">
            <label htmlFor="ciFeed">Item feed</label>
            <select id="ciFeed" value={itemFeedId} onChange={(e) => setItemFeedId(e.target.value)}>
              <option value="">None (channel not fed)</option>
              {feeds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.kind})
                </option>
              ))}
            </select>
            <button type="button" className="attr-add-link" onClick={onNewFeed}>
              + New item feed
            </button>
          </div>
          {itemFeedId && (
            <div className="field-block">
              <label htmlFor="ciInterval">Fire every (seconds)</label>
              <input
                id="ciInterval"
                type="number"
                min={5}
                value={interval}
                onChange={(e) => setInterval(Math.max(5, Number(e.target.value) || 5))}
              />
              <span className="note" style={{ marginTop: 4 }}>
                While the workflow is running, this channel fires a fresh batch this often.
              </span>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              onSave(
                itemFeedId
                  ? { inputType: "ITEM_FEED", itemFeedId, fireIntervalSeconds: interval }
                  : { inputType: "NONE", itemFeedId: null, fireIntervalSeconds: null }
              )
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
