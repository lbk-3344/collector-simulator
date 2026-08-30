"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDialog } from "@/components/AppDialog";
import { ItemFeedModal } from "../../item-feeds/ItemFeedModal";
import type { ItemFeedRecord } from "@/lib/itemFeed";
import { TaskNode, type TaskChannel } from "./TaskNode";
import { FlowEdge } from "./FlowEdge";
import { ActivityPanel } from "./ActivityPanel";
import { EdgeConfigPanel } from "./EdgeConfigPanel";
import { ChannelInputPicker } from "./ChannelInputPicker";

const nodeTypes = { task: TaskNode };
const edgeTypes = { flow: FlowEdge };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiTask = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiLink = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiWorkflow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiDevice = any;

function WorkflowEditorInner({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const { confirm } = useDialog();
  const { screenToFlowPosition } = useReactFlow();

  const [workflow, setWorkflow] = useState<ApiWorkflow | null>(null);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [links, setLinks] = useState<ApiLink[]>([]);
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [feeds, setFeeds] = useState<ItemFeedRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [assignTarget, setAssignTarget] = useState<{ taskId: string; channelId: string } | null>(null);
  const [editEdgeId, setEditEdgeId] = useState<string | null>(null);
  const [newFeedModal, setNewFeedModal] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  // Keep the latest server data reachable from stable callbacks.
  const dataRef = useRef({ tasks, links });
  dataRef.current = { tasks, links };

  const load = useCallback(async () => {
    const [wfRes, devRes, feedRes] = await Promise.all([
      fetch(`/api/workflows/${workflowId}`),
      fetch("/api/devices"),
      fetch("/api/item-feeds"),
    ]);
    if (wfRes.status === 404) {
      setNotFound(true);
      return;
    }
    if (!wfRes.ok) {
      setError("Couldn't load this workflow.");
      return;
    }
    const { workflow: wf } = await wfRes.json();
    setWorkflow(wf);
    setTasks(wf.tasks ?? []);
    setLinks(wf.flowLinks ?? []);
    setDevices((await devRes.json().catch(() => ({ devices: [] }))).devices ?? []);
    setFeeds((await feedRes.json().catch(() => ({ itemFeeds: [] }))).itemFeeds ?? []);
  }, [workflowId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── derive React Flow nodes/edges from server data ────────────────────
  const rebuild = useCallback(
    (t: ApiTask[], l: ApiLink[]) => {
      const outputsByTask: Record<string, Record<string, boolean>> = {};
      for (const link of l) {
        (outputsByTask[link.sourceTaskId] ??= {})[link.sourceChannelId] = true;
      }

      const feedName = new Map(feeds.map((f) => [f.id, f.name]));

      setNodes(
        t.map((task, i) => {
          const channels: TaskChannel[] = Array.isArray(task.device?.channels) ? task.device.channels : [];
          const inputs: Record<string, { inputType: "ITEM_FEED" | "FLOW_LINK" | "NONE"; itemFeedName?: string; fireIntervalSeconds?: number | null }> = {};
          for (const ci of task.channelInputs ?? []) {
            inputs[ci.channelId] = {
              inputType: ci.inputType,
              itemFeedName: ci.itemFeedId ? feedName.get(ci.itemFeedId) : undefined,
              fireIntervalSeconds: ci.fireIntervalSeconds,
            };
          }
          return {
            id: task.id,
            type: "task",
            position: {
              x: task.positionX ?? 80 + (i % 4) * 260,
              y: task.positionY ?? 80 + Math.floor(i / 4) * 200,
            },
            data: {
              taskId: task.id,
              deviceName: task.name || task.device?.name || "Device",
              deviceType: task.device?.type ?? "APP",
              collectorId: task.device?.collectorId ?? null,
              channels,
              inputs,
              outputs: outputsByTask[task.id] ?? {},
              onAssign: (taskId: string, channelId: string) => setAssignTarget({ taskId, channelId }),
            },
          } as Node;
        })
      );

      setEdges(
        l.map(
          (link) =>
            ({
              id: link.id,
              type: "flow",
              source: link.sourceTaskId,
              sourceHandle: link.sourceChannelId,
              target: link.targetTaskId,
              targetHandle: link.targetChannelId,
              data: {
                delayMinSeconds: link.delayMinSeconds,
                delayMaxSeconds: link.delayMaxSeconds,
                filterGtins: link.filterGtins ?? null,
                isElse: link.isElse,
                onEdit: (id: string) => setEditEdgeId(id),
              },
            }) as Edge
        )
      );
    },
    [feeds, setNodes, setEdges]
  );

  useEffect(() => {
    rebuild(tasks, links);
  }, [tasks, links, rebuild]);

  // ── canvas interactions ──────────────────────────────────────────────
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const deviceId = e.dataTransfer.getData("application/device-id");
      if (!deviceId) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, deviceId, positionX: Math.round(pos.x), positionY: Math.round(pos.y) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Couldn't add that device.");
        return;
      }
      await load();
    },
    [screenToFlowPosition, workflowId, load]
  );

  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return;
      const res = await fetch("/api/flow-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          sourceTaskId: c.source,
          sourceChannelId: c.sourceHandle,
          targetTaskId: c.target,
          targetChannelId: c.targetHandle,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Couldn't create that link.");
        return;
      }
      await load();
    },
    [workflowId, load]
  );

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    fetch(`/api/tasks/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionX: Math.round(node.position.x), positionY: Math.round(node.position.y) }),
    }).catch(() => {});
  }, []);

  const onNodesDelete = useCallback(
    async (deleted: Node[]) => {
      for (const n of deleted) await fetch(`/api/tasks/${n.id}`, { method: "DELETE" }).catch(() => {});
      await load();
    },
    [load]
  );

  const onEdgesDelete = useCallback(
    async (deleted: Edge[]) => {
      for (const ed of deleted) await fetch(`/api/flow-links/${ed.id}`, { method: "DELETE" }).catch(() => {});
      await load();
    },
    [load]
  );

  // ── toolbar actions ──────────────────────────────────────────────────
  const patchWorkflow = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Couldn't update the workflow.");
        return;
      }
      setWorkflow((await res.json()).workflow);
    },
    [workflowId]
  );

  async function toggleRun() {
    if (!workflow) return;
    if (workflow.status === "STOPPED") {
      const runnable = tasks.some((t) =>
        (t.channelInputs ?? []).some((ci: { inputType: string }) => ci.inputType === "ITEM_FEED")
      );
      if (!runnable) {
        const ok = await confirm({
          variant: "info",
          title: "Nothing will fire",
          message: "This workflow has no channel fed by an item feed, so running it won't generate anything yet. Start it anyway?",
          confirmLabel: "Start anyway",
        });
        if (!ok) return;
      }
    }
    await patchWorkflow({ status: workflow.status === "RUNNING" ? "STOPPED" : "RUNNING" });
  }

  const attachedDeviceIds = useMemo(() => new Set(tasks.map((t) => t.deviceId)), [tasks]);
  const paletteDevices = devices.filter((d) => d.configured && d.publishedAt && !d.task && !attachedDeviceIds.has(d.id));

  if (notFound) {
    return (
      <section className="fade-in placeholder">
        <span className="tag">Workflow</span>
        <h2>Not found</h2>
        <button className="btn btn-secondary" onClick={() => router.push("/workflows")}>
          Back to workflows
        </button>
      </section>
    );
  }

  return (
    <section className="fade-in wf-editor">
      <div className="wf-toolbar">
        <button className="link" onClick={() => router.push("/workflows")}>
          ← Workflows
        </button>
        <input
          className="wf-name-input"
          value={workflow?.name ?? ""}
          onChange={(e) => setWorkflow((w: ApiWorkflow) => ({ ...w, name: e.target.value }))}
          onBlur={(e) => e.target.value.trim() && patchWorkflow({ name: e.target.value.trim() })}
          placeholder="Workflow name"
        />
        <div className="wf-toolbar-spacer" />
        <label className="wf-duration">
          Auto-stop after
          <input
            type="number"
            min={1}
            value={workflow?.maxRunDurationMinutes ?? 240}
            onChange={(e) => setWorkflow((w: ApiWorkflow) => ({ ...w, maxRunDurationMinutes: Number(e.target.value) }))}
            onBlur={(e) => Number(e.target.value) > 0 && patchWorkflow({ maxRunDurationMinutes: Number(e.target.value) })}
          />
          min
        </label>
        <button className="btn btn-secondary" onClick={() => setShowActivity((v) => !v)}>
          Activity
        </button>
        <button
          className={`btn ${workflow?.status === "RUNNING" ? "btn-danger" : "btn-primary"}`}
          onClick={toggleRun}
          disabled={!workflow}
        >
          {workflow?.status === "RUNNING" ? "Stop" : "Run"}
        </button>
      </div>

      {workflow?.autoStoppedAt && (
        <div className="snack snack-warning" style={{ margin: "0 0 8px" }}>
          Auto-stopped {new Date(workflow.autoStoppedAt).toLocaleString()} — running since{" "}
          {workflow.runningStartedAt ? new Date(workflow.runningStartedAt).toLocaleString() : "?"}. Press Run to restart.
        </div>
      )}
      {error && <div className="snack snack-danger" style={{ margin: "0 0 8px" }}>{error}</div>}

      <div className="wf-canvas-wrap">
        <aside className="wf-palette">
          <div className="wf-palette-title">Devices</div>
          {paletteDevices.length === 0 ? (
            <p className="note" style={{ fontSize: 11, marginTop: 6 }}>
              No published, unattached devices. Configure &amp; publish devices first.
            </p>
          ) : (
            paletteDevices.map((d) => (
              <div
                key={d.id}
                className="wf-palette-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/device-id", d.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                {d.name}
                <span className="wf-palette-item-type">{d.type}</span>
              </div>
            ))
          )}
        </aside>

        <div className="wf-canvas" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {showActivity && <ActivityPanel workflowId={workflowId} onClose={() => setShowActivity(false)} />}
      </div>

      {assignTarget && (
        <ChannelInputPicker
          feeds={feeds}
          current={
            tasks
              .find((t) => t.id === assignTarget.taskId)
              ?.channelInputs?.find((ci: { channelId: string }) => ci.channelId === assignTarget.channelId) ?? null
          }
          onNewFeed={() => setNewFeedModal(true)}
          onClose={() => setAssignTarget(null)}
          onSave={async (payload) => {
            const task = tasks.find((t) => t.id === assignTarget.taskId);
            const channels: TaskChannel[] = task?.device?.channels ?? [];
            // full replace of this task's channelInputs
            const existing = new Map(
              (task?.channelInputs ?? []).map((ci: { channelId: string }) => [ci.channelId, ci])
            );
            existing.set(assignTarget.channelId, {
              channelId: assignTarget.channelId,
              inputType: payload.inputType,
              itemFeedId: payload.itemFeedId ?? null,
              fireIntervalSeconds: payload.fireIntervalSeconds ?? null,
            });
            const channelInputs = channels
              .map((ch) => existing.get(ch.id))
              .filter(Boolean)
              .filter((ci) => (ci as { inputType: string }).inputType !== "NONE" || existing.has((ci as { channelId: string }).channelId));
            await fetch(`/api/tasks/${assignTarget.taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ channelInputs }),
            });
            setAssignTarget(null);
            await load();
          }}
        />
      )}

      {editEdgeId && (
        <EdgeConfigPanel
          link={links.find((l) => l.id === editEdgeId)}
          siblingElseCount={(() => {
            const link = links.find((l) => l.id === editEdgeId);
            if (!link) return 0;
            return links.filter(
              (l) => l.id !== link.id && l.sourceTaskId === link.sourceTaskId && l.sourceChannelId === link.sourceChannelId && l.isElse
            ).length;
          })()}
          onClose={() => setEditEdgeId(null)}
          onSave={async (body) => {
            await fetch(`/api/flow-links/${editEdgeId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            setEditEdgeId(null);
            await load();
          }}
          onDelete={async () => {
            await fetch(`/api/flow-links/${editEdgeId}`, { method: "DELETE" });
            setEditEdgeId(null);
            await load();
          }}
        />
      )}

      <ItemFeedModal
        open={newFeedModal}
        feed={null}
        onClose={() => setNewFeedModal(false)}
        onSaved={async () => {
          setNewFeedModal(false);
          await load();
        }}
      />
    </section>
  );
}

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner workflowId={workflowId} />
    </ReactFlowProvider>
  );
}
