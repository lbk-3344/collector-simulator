"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@/components/AppDialog";
import { PageHeader } from "@/components/PageHeader";
import { SharedBadge } from "@/components/SharedBadge";
import { HideFromViewButton } from "@/components/HideFromViewButton";
import { useTableSort } from "@/lib/useTableSort";
import { ActivityModal } from "./ActivityModal";

const WORKFLOWS_INFO = (
  <>
    <p>
      A <strong>workflow</strong> is a graph of tasks — each task is one device — wired together by flow links, built on
      the canvas.
    </p>
    <p>
      While a workflow is <strong>running</strong>, its feed links fire batches of items onto device channels on a timer,
      each read is pushed to the Track &amp; Trace platform for real, and batches travel the flow links to downstream
      tasks. A safety timer auto-stops a run after its configured duration.
    </p>
    <p>
      Start or stop a workflow with the icon on its row, or use Start all / Stop all. The activity icon shows its
      recent reads without opening the canvas.
    </p>
  </>
);

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <path d="M6 4.5v11a1 1 0 0 0 1.5.87l9-5.5a1 1 0 0 0 0-1.74l-9-5.5A1 1 0 0 0 6 4.5Z" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <rect x="5" y="5" width="10" height="10" rx="1.6" />
    </svg>
  );
}
function ActivityIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 11h3l2-5.5 4 9 2-5.5h4" />
    </svg>
  );
}

interface WorkflowRow {
  id: string;
  ownerId: string;
  shared: boolean;
  name: string;
  status: "RUNNING" | "STOPPED";
  maxRunDurationMinutes: number | null;
  runningStartedAt: string | null;
  autoStoppedAt: string | null;
  taskCount: number;
  flowLinkCount: number;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const { confirm } = useDialog();
  const [rows, setRows] = useState<WorkflowRow[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [activityWorkflow, setActivityWorkflow] = useState<WorkflowRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/workflows");
    if (!res.ok) return setError("Couldn't load workflows.");
    const data = await res.json();
    setRows(data.workflows ?? []);
    setCurrentUserId(data.currentUserId ?? null);
  }, []);

  const mine = (wf: WorkflowRow) => currentUserId == null || wf.ownerId === currentUserId;

  const { rows: sortedRows, headerProps } = useTableSort(
    rows ?? [],
    {
      name: (w) => w.name.toLowerCase(),
      status: (w) => w.status,
      tasks: (w) => w.taskCount,
      links: (w) => w.flowLinkCount,
    },
    { key: "name" }
  );

  useEffect(() => {
    load();
  }, [load]);

  async function createWorkflow() {
    const name = window.prompt("New workflow name");
    if (!name || !name.trim()) return;
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) return setError("Couldn't create the workflow.");
    const { workflow } = await res.json();
    router.push(`/workflows/${workflow.id}`);
  }

  async function setStatus(id: string, status: "RUNNING" | "STOPPED") {
    setBusyId(id);
    const res = await fetch(`/api/workflows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) setError(`Couldn't ${status === "RUNNING" ? "start" : "stop"} the workflow.`);
    else setRows((rs) => rs?.map((w) => (w.id === id ? { ...w, status } : w)) ?? rs);
    setBusyId(null);
  }

  async function setAll(status: "RUNNING" | "STOPPED") {
    // Only workflows the current user owns — a shared one would 403.
    const targets = (rows ?? []).filter((w) => w.status !== status && mine(w));
    if (targets.length === 0) return;
    setError(null);
    setBulkBusy(true);
    const results = await Promise.all(
      targets.map((w) =>
        fetch(`/api/workflows/${w.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }).then((r) => r.ok)
      )
    );
    if (results.some((ok) => !ok)) setError(`Couldn't ${status === "RUNNING" ? "start" : "stop"} every workflow.`);
    setBulkBusy(false);
    await load();
  }

  async function handleDelete(wf: WorkflowRow) {
    const ok = await confirm({
      variant: "warning",
      title: "Delete workflow",
      message: `Delete "${wf.name}" and its ${wf.taskCount} task${wf.taskCount === 1 ? "" : "s"} and ${wf.flowLinkCount} link${wf.flowLinkCount === 1 ? "" : "s"}? This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(wf.id);
    const res = await fetch(`/api/workflows/${wf.id}`, { method: "DELETE" });
    if (!res.ok) setError("Couldn't delete this workflow.");
    await load();
    setBusyId(null);
  }

  return (
    <section className="fade-in">
      <PageHeader
        title="Workflows"
        info={WORKFLOWS_INFO}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {rows && rows.length > 0 && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setAll("RUNNING")}
                  disabled={bulkBusy || !rows.some((w) => mine(w) && w.status !== "RUNNING")}
                >
                  Start all
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setAll("STOPPED")}
                  disabled={bulkBusy || !rows.some((w) => mine(w) && w.status !== "STOPPED")}
                >
                  Stop all
                </button>
              </>
            )}
            <button className="btn btn-primary" onClick={createWorkflow}>
              + New workflow
            </button>
          </div>
        }
      />

      {error && <div className="snack snack-danger">{error}</div>}

      {!rows ? (
        <p className="note">Loading workflows…</p>
      ) : rows.length === 0 ? (
        <p className="note">
          No workflows yet. A workflow is a graph of tasks (each one device) wired together by flow links — build it on the
          canvas.
        </p>
      ) : (
        <div className="panel table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th {...headerProps("name")}>Name</th>
                <th {...headerProps("status")}>Status</th>
                <th {...headerProps("tasks")}>Tasks</th>
                <th {...headerProps("links")}>Links</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((wf) => {
                const readOnly = !mine(wf);
                return (
                <tr key={wf.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/workflows/${wf.id}`)}>
                  <td>
                    <div className="u-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {wf.name}
                      {readOnly && <SharedBadge />}
                    </div>
                    {wf.autoStoppedAt && <div className="u-email">auto-stopped {new Date(wf.autoStoppedAt).toLocaleString()}</div>}
                  </td>
                  <td>
                    <span className={`chip ${wf.status === "RUNNING" ? "chip-success" : "chip-stopped"}`}>
                      {wf.status === "RUNNING" ? "Running" : "Stopped"}
                    </span>
                  </td>
                  <td className="u-meta">{wf.taskCount}</td>
                  <td className="u-meta">{wf.flowLinkCount}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button
                        className={`row-icon-btn ${wf.status === "RUNNING" ? "row-icon-btn-stop" : "row-icon-btn-run"}`}
                        aria-label={wf.status === "RUNNING" ? "Stop" : "Start"}
                        title={readOnly ? "Shared with you — read-only" : wf.status === "RUNNING" ? "Stop" : "Start"}
                        disabled={busyId === wf.id || bulkBusy || readOnly}
                        onClick={() => setStatus(wf.id, wf.status === "RUNNING" ? "STOPPED" : "RUNNING")}
                      >
                        {wf.status === "RUNNING" ? <StopIcon /> : <PlayIcon />}
                      </button>
                      <button
                        className="row-icon-btn row-icon-btn-ghost"
                        aria-label="Activity"
                        title="Activity"
                        onClick={() => setActivityWorkflow(wf)}
                      >
                        <ActivityIcon />
                      </button>
                      {readOnly ? (
                        <HideFromViewButton
                          kind="workflow"
                          id={wf.id}
                          name={wf.name}
                          onHidden={() => setRows((rs) => rs?.filter((w) => w.id !== wf.id) ?? rs)}
                          onError={setError}
                        />
                      ) : (
                        <button
                          className="row-icon-btn row-icon-btn-delete"
                          aria-label="Delete"
                          title="Delete"
                          disabled={busyId === wf.id}
                          onClick={() => handleDelete(wf)}
                        >
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M5.5 6 6.2 16a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6M8.3 9v5M11.7 9v5" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activityWorkflow && (
        <ActivityModal
          workflowId={activityWorkflow.id}
          workflowName={activityWorkflow.name}
          onClose={() => setActivityWorkflow(null)}
        />
      )}
    </section>
  );
}
