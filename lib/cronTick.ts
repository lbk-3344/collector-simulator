import { runTick, type TickSummary } from "@/lib/workflowRun";
import { runHeartbeatTick, type HeartbeatTickSummary } from "@/lib/deviceHeartbeat";

// One combined tick for the single `/api/cron/tick` endpoint (2026-09-08).
// The run engine (BL-061) and the DataCollector heartbeat (BL-072) were two
// separate CRON_SECRET-guarded routes, each hit by its own per-minute
// external job — i.e. two DB-touching invocations every minute, on both the
// production and the staging branch. That kept Neon's compute pinned awake
// 24/7 (autosuspend can't kick in) and burned the free-tier compute quota,
// suspending the production database. Collapsing to one endpoint halves the
// invocations; the external scheduler now needs a single job.
//
// The two ticks are independent (different tables; each builds its own
// per-owner credentials cache), so they run concurrently to stay inside the
// route's maxDuration. `allSettled` — a failure in one never hides the
// other's result or stops it running.
export interface CombinedTickResult {
  ok: boolean;
  workflow: ({ ok: true } & TickSummary) | { ok: false; error: string };
  heartbeat: ({ ok: true } & HeartbeatTickSummary) | { ok: false; error: string };
}

export async function runCombinedTick(): Promise<CombinedTickResult> {
  const [wf, hb] = await Promise.allSettled([runTick(), runHeartbeatTick()]);

  const workflow: CombinedTickResult["workflow"] =
    wf.status === "fulfilled"
      ? { ok: true, ...wf.value }
      : { ok: false, error: wf.reason instanceof Error ? wf.reason.message : String(wf.reason) };

  const heartbeat: CombinedTickResult["heartbeat"] =
    hb.status === "fulfilled"
      ? { ok: true, ...hb.value }
      : { ok: false, error: hb.reason instanceof Error ? hb.reason.message : String(hb.reason) };

  if (workflow.ok === false) console.error("[cron/tick] workflow tick failed:", workflow.error);
  if (heartbeat.ok === false) console.error("[cron/tick] heartbeat tick failed:", heartbeat.error);

  return { ok: workflow.ok !== false && heartbeat.ok !== false, workflow, heartbeat };
}
