export type DeviceState = "OFF" | "ACTIVE" | "AUTOMATED" | "PROBLEM";

interface DeviceStateInput {
  configured: boolean;
  publishedAt?: string | Date | null;
  // A Device reaches its Workflow through a Task now (BL-059, section 16.6).
  task?: { workflow?: { status: "RUNNING" | "STOPPED" } | null } | null;
}

// Pure, not a stored column — see CLAUDE-CONCEPT.md section 15.3. Four
// states derived from `configured`, `publishedAt`, and the attached
// Workflow's status, used everywhere a Device renders as a colored marker
// or badge (Overview map, Devices list). Revised 2026-08-28 (BL-051): a
// Device can be fully configured and still read as Off/"Not configured"
// until it's been explicitly published.
export function getDeviceState(device: DeviceStateInput): DeviceState {
  if (!device.configured || !device.publishedAt) return "OFF";
  const workflow = device.task?.workflow ?? null;
  if (!workflow) return "ACTIVE";
  return workflow.status === "RUNNING" ? "AUTOMATED" : "PROBLEM";
}
