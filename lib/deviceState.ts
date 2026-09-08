export type DeviceState = "PENDING" | "READY" | "ACTIVE" | "OFFLINE";

// BL-086 — a Device turned Online (single toggle or the map's per-site power
// panel) auto-reverts to Offline this many minutes later, so an unused
// simulator stops sending heartbeats. The heartbeat tick does the flip.
export const AUTO_OFFLINE_MINUTES = 60;

interface DeviceStateInput {
  configured: boolean;
  publishedAt?: string | Date | null;
  offlineAt?: string | Date | null;
  // A Device reaches its Workflow(s) through Task(s) now (BL-059 §16.6;
  // 2026-09-04 — a Device can be a Task in several Workflows at once).
  tasks?: ({ workflow?: { status: "RUNNING" | "STOPPED" } | null } | null)[] | null;
}

// Pure, not a stored column — see CLAUDE-CONCEPT.md section 15.3. Revised
// 2026-09-02 (BL-074): renamed to match how Luc actually refers to these
// (old ACTIVE -> READY, old AUTOMATED -> ACTIVE), retired the old PROBLEM
// state (a stopped-workflow Device now just reads as Ready, same as no
// workflow at all), and added a manual OFFLINE state. Precedence matters:
// a running workflow always wins over a manual offline flag, so ACTIVE is
// checked before OFFLINE (and offlineAt is not cleared when this happens,
// so the Device reverts to OFFLINE once that workflow stops).
export function getDeviceState(device: DeviceStateInput): DeviceState {
  if (!device.configured || !device.publishedAt) return "PENDING";
  // ACTIVE if the Device is in *any* running Workflow.
  const inRunningWorkflow = (device.tasks ?? []).some((t) => t?.workflow?.status === "RUNNING");
  if (inRunningWorkflow) return "ACTIVE";
  if (device.offlineAt) return "OFFLINE";
  return "READY";
}
