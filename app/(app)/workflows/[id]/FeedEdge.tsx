"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

export interface FeedEdgeData {
  fireIntervalSeconds: number;
  onEdit?: (id: string) => void;
  [key: string]: unknown;
}

// A Feed Link edge — FeedNode → Task Channel. Label chip shows the fire
// interval; clicking it opens the interval panel.
export function FeedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const d = data as FeedEdgeData;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} style={{ strokeDasharray: "5 4" }} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="wf-edge-label wf-edge-label-feed"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => d.onEdit?.(id)}
        >
          every {d.fireIntervalSeconds}s
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
