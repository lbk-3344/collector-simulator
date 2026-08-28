export type DeviceState = "OFF" | "ACTIVE" | "AUTOMATED" | "PROBLEM";

interface DeviceStateInput {
  configured: boolean;
  workflow?: { status: "RUNNING" | "STOPPED" } | null;
}

// Pure, not a stored column — see CLAUDE-CONCEPT.md section 15.3. Four
// states derived from `configured` and the attached Workflow's status, used
// everywhere a Device renders as a colored marker or badge (Overview map,
// Devices list).
export function getDeviceState(device: DeviceStateInput): DeviceState {
  if (!device.configured) return "OFF";
  if (!device.workflow) return "ACTIVE";
  return device.workflow.status === "RUNNING" ? "AUTOMATED" : "PROBLEM";
}
