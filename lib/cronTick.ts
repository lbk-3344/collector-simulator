import { runTick, type TickSummary } from "@/lib/workflowRun";
import { runHeartbeatTick, type HeartbeatTickSummary } from "@/lib/deviceHeartbeat";
import {
  isCronClockEnabled,
  readNextDueAt,
  computeNextDueAt,
  writeNextDueAt,
  CRON_CLOCK_SKEW_MS,
} from "@/lib/cronClock";

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
//
// Skip-gate (lib/cronClock.ts): when the Vercel Global Config store is
// configured, a tick with nothing due returns immediately with
// `skipped: true` and never touches Postgres, so the Neon compute can
// autosuspend while idle. Only `/api/cron/tick` is gated — the deprecated
// split routes still run in full.
export interface CombinedTickResult {
  ok: boolean;
  // true when the skip-gate short-circuited this tick (no DB work done).
  skipped?: boolean;
  // epoch-ms the engine next has real work; present whenever the gate is on.
  nextDueAt?: number;
  workflow?: ({ ok: true } & TickSummary) | { ok: false; error: string };
  heartbeat?: ({ ok: true } & HeartbeatTickSummary) | { ok: false; error: string };
}

export async function runCombinedTick(): Promise<CombinedTickResult> {
  const gated = isCronClockEnabled();

  if (gated) {
    const nextDueAt = await readNextDueAt();
    if (nextDueAt != null && nextDueAt - CRON_CLOCK_SKEW_MS > Date.now()) {
      return { ok: true, skipped: true, nextDueAt };
    }
  }

  const [wf, hb] = await Promise.allSettled([runTick(), runHeartbeatTick()]);

  const workflow: NonNullable<CombinedTickResult["workflow"]> =
    wf.status === "fulfilled"
      ? { ok: true, ...wf.value }
      : { ok: false, error: wf.reason instanceof Error ? wf.reason.message : String(wf.reason) };

  const heartbeat: NonNullable<CombinedTickResult["heartbeat"]> =
    hb.status === "fulfilled"
      ? { ok: true, ...hb.value }
      : { ok: false, error: hb.reason instanceof Error ? hb.reason.message : String(hb.reason) };

  if (workflow.ok === false) console.error("[cron/tick] workflow tick failed:", workflow.error);
  if (heartbeat.ok === false) console.error("[cron/tick] heartbeat tick failed:", heartbeat.error);

  const result: CombinedTickResult = {
    ok: workflow.ok !== false && heartbeat.ok !== false,
    workflow,
    heartbeat,
  };

  if (gated) {
    // Recompute + store the next-due instant from the state this tick left
    // behind. The DB was already touched above, so this adds no Neon wake.
    const next = await computeNextDueAt();
    await writeNextDueAt(next);
    result.nextDueAt = next;
  }

  return result;
}
