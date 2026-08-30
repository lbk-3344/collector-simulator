"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@/components/AppDialog";

interface WorkflowRow {
  id: string;
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
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/workflows");
    if (!res.ok) return setError("Couldn't load workflows.");
    setRows((await res.json()).workflows ?? []);
  }, []);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Workflows
        </h1>
        <button className="btn btn-primary" onClick={createWorkflow}>
          + New workflow
        </button>
      </div>

      {error && <div className="snack snack-danger">{error}</div>}

      {!rows ? (
        <p className="note">Loading workflows…</p>
      ) : rows.length === 0 ? (
        <p className="note">
          No workflows yet. A workflow is a graph of tasks (each one device) wired together by flow links — build it on the
          canvas.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Tasks</th>
                <th>Links</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((wf) => (
                <tr key={wf.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/workflows/${wf.id}`)}>
                  <td>
                    <div className="u-name">{wf.name}</div>
                    {wf.autoStoppedAt && <div className="u-email">auto-stopped {new Date(wf.autoStoppedAt).toLocaleString()}</div>}
                  </td>
                  <td>
                    <span className={`chip ${wf.status === "RUNNING" ? "chip-success" : "chip-warning"}`}>
                      {wf.status === "RUNNING" ? "Running" : "Stopped"}
                    </span>
                  </td>
                  <td className="u-meta">{wf.taskCount}</td>
                  <td className="u-meta">{wf.flowLinkCount}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
