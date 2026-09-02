export type DeviceState = "PENDING" | "READY" | "ACTIVE" | "OFFLINE";

interface DeviceStateInput {
  configured: boolean;
  publishedAt?: string | Date | null;
  offlineAt?: string | Date | null;
  // A Device reaches its Workflow through a Task now (BL-059, section 16.6).
  task?: { workflow?: { status: "RUNNING" | "STOPPED" } | null } | null;
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
  const workflow = device.task?.workflow ?? null;
  if (workflow?.status === "RUNNING") return "ACTIVE";
  if (device.offlineAt) return "OFFLINE";
  return "READY";
}
