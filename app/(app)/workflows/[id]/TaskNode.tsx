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
  fedChannels: Record<string, number>; // channelId → count of FeedLinks/FlowLinks targeting it
  [key: string]: unknown;
}

// A Task node — header + one row per Channel of its Device. Each row has a
// left target handle (receives Feed Links / Flow Links — any number) and a
// right source handle (sends Flow Links). A Channel with inbound links shows
// a filled left dot.
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
          const fedCount = d.fedChannels[ch.id] ?? 0;
          return (
            <div key={ch.id} className="wf-channel-row">
              <Handle type="target" position={Position.Left} id={ch.id} className={`wf-handle${fedCount > 0 ? " active" : ""}`} />
              {/* Prefer the Channel's name for display (same as the manual-feed
                  popup); the code + full name + input count always live in the
                  tooltip in case the name is truncated. */}
              <div
                className="wf-channel-btn"
                style={{ cursor: "default" }}
                title={`${ch.id}${ch.name ? ` — ${ch.name}` : ""}${
                  fedCount > 0 ? ` · ${fedCount} input${fedCount === 1 ? "" : "s"}` : ""
                }`}
              >
                <span className="wf-channel-id">{ch.id}</span>
                <span className="wf-channel-meta">
                  {ch.name
                    ? ch.name
                    : fedCount > 0
                      ? `⇐ ${fedCount} input${fedCount === 1 ? "" : "s"}`
                      : ch.type.toLowerCase()}
                </span>
              </div>
              <Handle type="source" position={Position.Right} id={ch.id} className="wf-handle" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
