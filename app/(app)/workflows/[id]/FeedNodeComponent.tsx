"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface FeedNodeData {
  feedNodeId: string;
  feedName: string;
  feedKind: "NEW" | "PRESENT" | "FIXED";
  detail: string;
  [key: string]: unknown;
}

const KIND_ICON: Record<string, string> = { NEW: "✦", PRESENT: "◧", FIXED: "≡" };

// A Feed Node — one canvas placement of a reusable Item Feed. Distinct
// navy/white style vs Task nodes (CHARTE-GRAPHIQUE.md "Workflow canvas — Feed
// Node visual style"). One output handle; drag it to a Task Channel to make
// a Feed Link.
export function FeedNodeComponent({ data }: NodeProps) {
  const d = data as FeedNodeData;
  return (
    <div className="wf-feed-node">
      <div className="wf-feed-node-icon" aria-hidden="true">
        {KIND_ICON[d.feedKind] ?? "✦"}
      </div>
      <div className="wf-feed-node-text">
        <span className="wf-feed-node-name">{d.feedName}</span>
        <span className="wf-feed-node-kind">
          {d.feedKind} · {d.detail}
        </span>
      </div>
      <Handle type="source" position={Position.Right} id="out" className="wf-handle wf-handle-feed" />
    </div>
  );
}
