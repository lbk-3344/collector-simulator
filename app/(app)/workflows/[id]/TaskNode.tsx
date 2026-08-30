"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import ReadPointIcon from "@/components/ui/ReadPointIcon";

export interface TaskChannel {
  id: string;
  name?: string;
  type: "PRESENCE" | "DIRECTIONAL";
}

export interface TaskNodeData {
  taskId: string;
  deviceName: string;
  deviceType: string;
  collectorId: string | null;
  channels: TaskChannel[];
  // per channelId: what feeds it
  inputs: Record<string, { inputType: "ITEM_FEED" | "FLOW_LINK" | "NONE"; itemFeedName?: string; fireIntervalSeconds?: number | null }>;
  outputs: Record<string, boolean>; // channelId → is the source of ≥1 flow link
  onAssign: (taskId: string, channelId: string) => void;
  [key: string]: unknown;
}

// A Task node — header + one row per Channel of its Device. Each row has a
// left target handle (can receive) and a right source handle (can send);
// which side is "real" is shown by styling (an assigned input dims the
// right handle, an outgoing link dims the left) but both stay usable until
// committed, per CLAUDE-CONCEPT.md 16.4.
export function TaskNode({ data }: NodeProps) {
  const d = data as TaskNodeData;
  return (
    <div className="wf-node">
      <div className="wf-node-head">
        <ReadPointIcon type={d.deviceType} size={18} />
        <div className="wf-node-head-text">
          <span className="wf-node-name">{d.deviceName}</span>
          {d.collectorId && <span className="wf-node-cid">{d.collectorId}</span>}
        </div>
      </div>
      <div className="wf-node-channels">
        {d.channels.map((ch) => {
          const input = d.inputs[ch.id]?.inputType ?? "NONE";
          const isOutput = Boolean(d.outputs[ch.id]);
          return (
            <div key={ch.id} className="wf-channel-row">
              <Handle
                type="target"
                position={Position.Left}
                id={ch.id}
                className={`wf-handle${input === "NONE" && !isOutput ? "" : input === "FLOW_LINK" ? " active" : " dim"}`}
              />
              <button
                type="button"
                className="wf-channel-btn"
                onClick={() => d.onAssign(d.taskId, ch.id)}
                title="Assign this channel's input"
              >
                <span className="wf-channel-id">{ch.id}</span>
                <span className="wf-channel-meta">
                  {input === "ITEM_FEED"
                    ? `⇐ ${d.inputs[ch.id]?.itemFeedName ?? "feed"}${
                        d.inputs[ch.id]?.fireIntervalSeconds ? ` · ${d.inputs[ch.id]?.fireIntervalSeconds}s` : ""
                      }`
                    : input === "FLOW_LINK"
                      ? "⇐ flow link"
                      : ch.name || ch.type.toLowerCase()}
                </span>
              </button>
              <Handle
                type="source"
                position={Position.Right}
                id={ch.id}
                className={`wf-handle${isOutput ? " active" : input === "NONE" ? "" : " dim"}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
