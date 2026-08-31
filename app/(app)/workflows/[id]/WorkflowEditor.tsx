"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SharedBadge } from "@/components/SharedBadge";
import { ContextMenu } from "@/components/ContextMenu";
import { ItemFeedModal } from "../../item-feeds/ItemFeedModal";
import type { ItemFeedRecord } from "@/lib/itemFeed";
import { TaskNode, type TaskChannel } from "./TaskNode";
import { FeedNodeComponent } from "./FeedNodeComponent";
import { FlowEdge } from "./FlowEdge";
import { FeedEdge } from "./FeedEdge";
import { ActivityPanel } from "./ActivityPanel";
import { EdgeConfigPanel } from "./EdgeConfigPanel";

const nodeTypes = { task: TaskNode, feed: FeedNodeComponent };
const edgeTypes = { flow: FlowEdge, feed: FeedEdge };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// "In stock" is the user-facing label for the PRESENT kind (BUG #cmth5k10o);
// the enum value stays PRESENT.
const FEED_KIND_LABEL: Record<string, string> = { NEW: "NEW", PRESENT: "IN STOCK", FIXED: "FIXED" };

function feedDetail(f: Any): string {
  if (!f) return "";
  if (f.kind === "FIXED") return "fixed list";
  if (f.kind === "PRESENT" && f.presentMatchMode === "ALL") return "any GTIN in zone";
  const n = Array.isArray(f.gtins) ? f.gtins.length : 0;
  return n === 1 ? `GTIN ${f.gtins[0]}` : n > 1 ? `${n} GTINs` : "no GTIN";
}

function WorkflowEditorInner({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const { confirm } = useDialog();
  const { screenToFlowPosition } = useReactFlow();

  const [workflow, setWorkflow] = useState<Any | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Any[]>([]);
  const [feedNodes, setFeedNodes] = useState<Any[]>([]);
  const [feedLinks, setFeedLinks] = useState<Any[]>([]);
  const [flowLinks, setFlowLinks] = useState<Any[]>([]);
  const [devices, setDevices] = useState<Any[]>([]);
  const [feeds, setFeeds] = useState<ItemFeedRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [editFlowId, setEditFlowId] = useState<string | null>(null);
  const [editFeedLinkId, setEditFeedLinkId] = useState<string | null>(null);
  // Feed create/edit modal. `dropPos` set → on save also place a FeedNode
  // there. `feed` set → editing that shared ItemFeed definition.
  const [feedModal, setFeedModal] = useState<{ feed: ItemFeedRecord | null; dropPos: { x: number; y: number } | null } | null>(
    null
  );
  const [showActivity, setShowActivity] = useState(false);

  // Feed Node right-click Copy/Paste/Duplicate (BL-071). Same lifetime as the
  // map's deviceClipboard — plain state, gone on reload, survives repeated
  // pastes. Gated by the page-wide `readOnly` flag, not per-node (§16.9).
  const [feedClipboard, setFeedClipboard] = useState<{ itemFeedId: string } | null>(null);
  const [feedContextMenu, setFeedContextMenu] = useState<{ x: number; y: number; node: Node } | null>(null);

  const feedNodeIds = useMemo(() => new Set(feedNodes.map((f) => f.id)), [feedNodes]);

  // BL-068: a Workflow shared with the current user (owned by someone else) is
  // fully read-only — no node/edge editing, no run toggle, no config popovers.
  const readOnly = workflow != null && currentUserId != null && workflow.ownerId !== currentUserId;

  const load = useCallback(async () => {
    const [wfRes, devRes, feedRes] = await Promise.all([
      fetch(`/api/workflows/${workflowId}`),
      fetch("/api/devices"),
      fetch("/api/item-feeds"),
    ]);
    if (wfRes.status === 404) return setNotFound(true);
    if (!wfRes.ok) return setError("Couldn't load this workflow.");
    const wfBody = await wfRes.json();
    const wf = wfBody.workflow;
    setWorkflow(wf);
    setCurrentUserId(wfBody.currentUserId ?? null);
    setTasks(wf.tasks ?? []);
    setFeedNodes(wf.feedNodes ?? []);
    setFeedLinks(wf.feedLinks ?? []);
    setFlowLinks(wf.flowLinks ?? []);
    setDevices((await devRes.json().catch(() => ({ devices: [] }))).devices ?? []);
    setFeeds((await feedRes.json().catch(() => ({ itemFeeds: [] }))).itemFeeds ?? []);
  }, [workflowId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── derive React Flow nodes/edges ────────────────────────────────────
  useEffect(() => {
    const fedCountByTask: Record<string, Record<string, number>> = {};
    const bump = (taskId: string, ch: string) => {
      ((fedCountByTask[taskId] ??= {})[ch] ??= 0), (fedCountByTask[taskId][ch] += 1);
    };
    for (const fl of feedLinks) bump(fl.targetTaskId, fl.targetChannelId);
    for (const fl of flowLinks) bump(fl.targetTaskId, fl.targetChannelId);

    const taskNodes: Node[] = tasks.map((task, i) => {
      const channels: TaskChannel[] = Array.isArray(task.device?.channels) ? task.device.channels : [];
      return {
        id: task.id,
        type: "task",
        position: { x: task.positionX ?? 320 + (i % 3) * 260, y: task.positionY ?? 60 + Math.floor(i / 3) * 210 },
        data: {
          taskId: task.id,
          deviceName: task.name || task.device?.name || "Device",
          deviceType: task.device?.type ?? "APP",
          collectorId: task.device?.collectorId ?? null,
          channels,
          fedChannels: fedCountByTask[task.id] ?? {},
        },
      } as Node;
    });

    const feedNodeNodes: Node[] = feedNodes.map((fn, i) => ({
      id: fn.id,
      type: "feed",
      position: { x: fn.positionX ?? 40, y: fn.positionY ?? 60 + i * 130 },
      data: {
        feedNodeId: fn.id,
        itemFeedId: fn.itemFeedId,
        feedName: fn.itemFeed?.name ?? "Feed",
        feedKind: fn.itemFeed?.kind ?? "NEW",
        detail: feedDetail(fn.itemFeed),
      },
    })) as Node[];

    setNodes([...feedNodeNodes, ...taskNodes]);

    const feedEdges: Edge[] = feedLinks.map((fl) => ({
      id: fl.id,
      type: "feed",
      source: fl.feedNodeId,
      sourceHandle: "out",
      target: fl.targetTaskId,
      targetHandle: fl.targetChannelId,
      data: {
        fireIntervalSeconds: fl.fireIntervalSeconds,
        onEdit: (id: string) => setEditFeedLinkId(id),
      },
    })) as Edge[];

    const flowEdges: Edge[] = flowLinks.map((fl) => ({
      id: fl.id,
      type: "flow",
      source: fl.sourceTaskId,
      sourceHandle: fl.sourceChannelId,
      target: fl.targetTaskId,
      targetHandle: fl.targetChannelId,
      data: {
        delayMinSeconds: fl.delayMinSeconds,
        delayMaxSeconds: fl.delayMaxSeconds,
        filterGtins: fl.filterGtins ?? null,
        isElse: fl.isElse,
        onEdit: (id: string) => setEditFlowId(id),
      },
    })) as Edge[];

    setEdges([...feedEdges, ...flowEdges]);
  }, [tasks, feedNodes, feedLinks, flowLinks, setNodes, setEdges]);

  // ── interactions ────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (readOnly) return;
      const deviceId = e.dataTransfer.getData("application/device-id");
      const feedId = e.dataTransfer.getData("application/feed-id");
      const newFeed = e.dataTransfer.getData("application/new-feed");
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const p = { positionX: Math.round(pos.x), positionY: Math.round(pos.y) };

      // "+ New feed" dropped — define the ItemFeed inline, then place it here.
      if (newFeed) {
        setFeedModal({ feed: null, dropPos: pos });
        return;
      }

      let res: Response | null = null;
      if (deviceId) {
        res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowId, deviceId, ...p }),
        });
      } else if (feedId) {
        res = await fetch("/api/feed-nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowId, itemFeedId: feedId, ...p }),
        });
      }
      if (res && !res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Couldn't add that.");
      }
      if (res) await load();
    },
    [screenToFlowPosition, workflowId, load, readOnly]
  );

  const onConnect = useCallback(
    async (c: Connection) => {
      if (readOnly) return;
      if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return;
      const isFeed = feedNodeIds.has(c.source);
      const res = isFeed
        ? await fetch("/api/feed-links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workflowId,
              feedNodeId: c.source,
              targetTaskId: c.target,
              targetChannelId: c.targetHandle,
              fireIntervalSeconds: 60,
            }),
          })
        : await fetch("/api/flow-links", {
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
    [workflowId, load, feedNodeIds, readOnly]
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (readOnly) return;
      const url = feedNodeIds.has(node.id) ? `/api/feed-nodes/${node.id}` : `/api/tasks/${node.id}`;
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionX: Math.round(node.position.x), positionY: Math.round(node.position.y) }),
      }).catch(() => {});
    },
    [feedNodeIds, readOnly]
  );

  const onNodesDelete = useCallback(
    async (deleted: Node[]) => {
      if (readOnly) return;
      for (const n of deleted) {
        const url = feedNodeIds.has(n.id) ? `/api/feed-nodes/${n.id}` : `/api/tasks/${n.id}`;
        await fetch(url, { method: "DELETE" }).catch(() => {});
      }
      await load();
    },
    [load, feedNodeIds, readOnly]
  );

  const onEdgesDelete = useCallback(
    async (deleted: Edge[]) => {
      if (readOnly) return;
      for (const ed of deleted) {
        const url = ed.type === "feed" ? `/api/feed-links/${ed.id}` : `/api/flow-links/${ed.id}`;
        await fetch(url, { method: "DELETE" }).catch(() => {});
      }
      await load();
    },
    [load, readOnly]
  );

  // BL-071 — clone the ItemFeed a Feed Node points at into an independent new
  // feed, then place a FeedNode for it. Two calls + reload, mirroring the
  // map's duplicateDevice.
  const duplicateFeedNode = useCallback(
    async (sourceItemFeedId: string, positionX: number, positionY: number) => {
      if (readOnly) return;
      const dupRes = await fetch(`/api/item-feeds/${sourceItemFeedId}/duplicate`, { method: "POST" });
      if (!dupRes.ok) {
        const d = await dupRes.json().catch(() => null);
        setError(d?.error ?? "Couldn't duplicate that feed.");
        return;
      }
      const { itemFeed } = await dupRes.json();
      await fetch("/api/feed-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          itemFeedId: itemFeed.id,
          positionX: Math.round(positionX),
          positionY: Math.round(positionY),
        }),
      });
      await load();
    },
    [workflowId, load, readOnly]
  );

  // Remove a Feed Node from this workflow (BL-071 follow-up). Deletes only the
  // FeedNode placement + its feed links (FeedLink.feedNode cascades) — the
  // shared ItemFeed definition stays in the Item Feeds library.
  const deleteFeedNode = useCallback(
    async (feedNodeId: string, feedName: string) => {
      if (readOnly) return;
      const ok = await confirm({
        variant: "warning",
        title: "Remove feed from workflow",
        message: `Remove "${feedName}" and its feed links from this workflow? The feed definition itself stays in your Item Feeds library.`,
        confirmLabel: "Remove",
        danger: true,
      });
      if (!ok) return;
      const res = await fetch(`/api/feed-nodes/${feedNodeId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Couldn't remove that feed from the workflow.");
      }
      await load();
    },
    [confirm, load, readOnly]
  );

  const patchWorkflow = useCallback(
    async (body: Record<string, unknown>) => {
      if (readOnly) return;
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
    [workflowId, readOnly]
  );

  async function toggleRun() {
    if (!workflow || readOnly) return;
    if (workflow.status === "STOPPED" && feedLinks.length === 0) {
      const ok = await confirm({
        variant: "info",
        title: "Nothing will fire",
        message: "This workflow has no feed link, so running it won't generate anything yet. Start it anyway?",
        confirmLabel: "Start anyway",
      });
      if (!ok) return;
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
          onChange={(e) => setWorkflow((w: Any) => ({ ...w, name: e.target.value }))}
          onBlur={(e) => e.target.value.trim() && patchWorkflow({ name: e.target.value.trim() })}
          placeholder="Workflow name"
          disabled={readOnly}
        />
        {readOnly && <SharedBadge />}
        <div className="wf-toolbar-spacer" />
        <label className="wf-duration">
          Auto-stop after
          <input
            type="number"
            min={1}
            value={workflow?.maxRunDurationMinutes ?? 240}
            onChange={(e) => setWorkflow((w: Any) => ({ ...w, maxRunDurationMinutes: Number(e.target.value) }))}
            onBlur={(e) => Number(e.target.value) > 0 && patchWorkflow({ maxRunDurationMinutes: Number(e.target.value) })}
            disabled={readOnly}
          />
          min
        </label>
        <button className="btn btn-secondary" onClick={() => setShowActivity((v) => !v)}>
          Activity
        </button>
        <button
          className={`btn ${workflow?.status === "RUNNING" ? "btn-danger" : "btn-primary"}`}
          onClick={toggleRun}
          disabled={!workflow || readOnly}
          title={readOnly ? "Shared with you — read-only" : undefined}
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
        {!readOnly && (
        <aside className="wf-palette">
          <div className="wf-palette-title">Your devices</div>
          {paletteDevices.length === 0 ? (
            <p className="note" style={{ fontSize: 11, marginTop: 6 }}>
              No published, unattached devices.
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

          <div className="wf-palette-title" style={{ marginTop: 16 }}>
            Item feeds
          </div>
          {feeds.map((f) => (
            <div
              key={f.id}
              className="wf-palette-item wf-palette-item-feed"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/feed-id", f.id);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              {f.name}
              <span className="wf-palette-item-type">{FEED_KIND_LABEL[f.kind] ?? f.kind}</span>
            </div>
          ))}
          <div
            className="wf-palette-item wf-palette-item-feed wf-palette-item-new"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/new-feed", "1");
              e.dataTransfer.effectAllowed = "move";
            }}
            title="Drag onto the canvas to define a new feed here"
          >
            + New feed
            <span className="wf-palette-item-type">drag</span>
          </div>
        </aside>
        )}

        <div className="wf-canvas" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={async (_, node) => {
              // Feed nodes open the item-feed definition — editable when you
              // own the workflow, read-only when it's shared with you.
              if (node.type !== "feed") return;
              const id = (node.data as Any).itemFeedId as string | undefined;
              if (!id) return;
              const r = await fetch(`/api/item-feeds/${id}`);
              if (!r.ok) return;
              const { itemFeed } = await r.json();
              setFeedModal({ feed: itemFeed, dropPos: null });
            }}
            onNodeContextMenu={(e, node) => {
              // Feed Nodes only — right-click opens Copy/Paste/Duplicate
              // (BL-071). Task cloning has its own entry points elsewhere.
              if (readOnly || node.type !== "feed") return;
              e.preventDefault();
              setFeedContextMenu({ x: e.clientX, y: e.clientY, node });
            }}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesReconnectable={!readOnly}
            deleteKeyCode={readOnly ? null : undefined}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {showActivity && <ActivityPanel workflowId={workflowId} onClose={() => setShowActivity(false)} />}
      </div>

      {editFlowId && (
        <EdgeConfigPanel
          readOnly={readOnly}
          link={flowLinks.find((l) => l.id === editFlowId)}
          siblingElseCount={(() => {
            const link = flowLinks.find((l) => l.id === editFlowId);
            if (!link) return 0;
            return flowLinks.filter(
              (l) => l.id !== link.id && l.sourceTaskId === link.sourceTaskId && l.sourceChannelId === link.sourceChannelId && l.isElse
            ).length;
          })()}
          onClose={() => setEditFlowId(null)}
          onSave={async (body) => {
            await fetch(`/api/flow-links/${editFlowId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            setEditFlowId(null);
            await load();
          }}
          onDelete={async () => {
            await fetch(`/api/flow-links/${editFlowId}`, { method: "DELETE" });
            setEditFlowId(null);
            await load();
          }}
        />
      )}

      {editFeedLinkId && (
        <FeedLinkPanel
          readOnly={readOnly}
          link={feedLinks.find((l) => l.id === editFeedLinkId)}
          onClose={() => setEditFeedLinkId(null)}
          onSave={async (fireIntervalSeconds) => {
            await fetch(`/api/feed-links/${editFeedLinkId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fireIntervalSeconds }),
            });
            setEditFeedLinkId(null);
            await load();
          }}
          onDelete={async () => {
            await fetch(`/api/feed-links/${editFeedLinkId}`, { method: "DELETE" });
            setEditFeedLinkId(null);
            await load();
          }}
        />
      )}

      <ItemFeedModal
        open={!!feedModal}
        feed={feedModal?.feed ?? null}
        readOnly={readOnly}
        onClose={() => setFeedModal(null)}
        onSaved={async (saved) => {
          const dropPos = feedModal?.dropPos ?? null;
          setFeedModal(null);
          if (dropPos) {
            await fetch("/api/feed-nodes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workflowId,
                itemFeedId: saved.id,
                positionX: Math.round(dropPos.x),
                positionY: Math.round(dropPos.y),
              }),
            });
          }
          await load();
        }}
      />

      {feedContextMenu && (
        <ContextMenu
          x={feedContextMenu.x}
          y={feedContextMenu.y}
          canPaste={feedClipboard !== null}
          onCopy={() =>
            setFeedClipboard({ itemFeedId: (feedContextMenu.node.data as Any).itemFeedId as string })
          }
          onPaste={() => {
            if (!feedClipboard) return;
            // Paste lands where the menu was opened (client coords) — convert
            // to flow space. Use the clipboard's feed, not the right-clicked
            // node (they may differ).
            const pos = screenToFlowPosition({ x: feedContextMenu.x, y: feedContextMenu.y });
            duplicateFeedNode(feedClipboard.itemFeedId, pos.x, pos.y);
          }}
          onDuplicate={() => {
            const itemFeedId = (feedContextMenu.node.data as Any).itemFeedId as string;
            // Offset from the source node's own position — already flow space.
            duplicateFeedNode(itemFeedId, feedContextMenu.node.position.x + 24, feedContextMenu.node.position.y + 24);
          }}
          onDelete={() =>
            deleteFeedNode(
              feedContextMenu.node.id,
              ((feedContextMenu.node.data as Any).feedName as string) ?? "this feed"
            )
          }
          deleteLabel="Remove from workflow"
          onClose={() => setFeedContextMenu(null)}
        />
      )}
    </section>
  );
}

function FeedLinkPanel({
  link,
  onClose,
  onSave,
  onDelete,
  readOnly = false,
}: {
  link: Any;
  onClose: () => void;
  onSave: (interval: number) => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  const [interval, setInterval] = useState<number>(link?.fireIntervalSeconds ?? 60);
  if (!link) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" role="dialog" aria-modal="true" style={{ width: 380 }}>
        <div className="modal-head">
          <h2>Feed link</h2>
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
            <div className="field-block">
              <label htmlFor="flInterval">Fire every (seconds)</label>
              <input
                id="flInterval"
                type="number"
                min={5}
                value={interval}
                onChange={(e) => setInterval(Math.max(5, Number(e.target.value) || 5))}
              />
              <span className="note" style={{ marginTop: 4 }}>
                While the workflow is running, this feed fires a fresh batch into the channel this often.
              </span>
            </div>
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
              <button className="btn btn-primary" onClick={() => onSave(interval)}>
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner workflowId={workflowId} />
    </ReactFlowProvider>
  );
}
