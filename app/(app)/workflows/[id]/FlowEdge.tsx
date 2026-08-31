"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

export interface FlowEdgeData {
  delayMinSeconds: number;
  delayMaxSeconds: number;
  filterGtins: string[] | null;
  isElse: boolean;
  onEdit?: (id: string) => void;
  [key: string]: unknown;
}

function label(d: FlowEdgeData): string {
  if (d.isElse) return "else";
  const delay =
    d.delayMinSeconds === d.delayMaxSeconds ? `${d.delayMinSeconds}s` : `${d.delayMinSeconds}–${d.delayMaxSeconds}s`;
  const filter = d.filterGtins && d.filterGtins.length ? ` · ${d.filterGtins.length} GTIN` : "";
  return `${delay}${filter}`;
}

// A clickable label chip on the edge — opens the delay/filter/else panel
// (matches workflow-canvas-editor.html's interaction).
export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const d = data as FlowEdgeData;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={path} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`wf-edge-label${d.isElse ? " is-else" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => d.onEdit?.(id)}
          disabled={!d.onEdit}
        >
          {label(d)}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
