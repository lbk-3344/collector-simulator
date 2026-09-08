export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runHeartbeatTick } from "@/lib/deviceHeartbeat";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

// Real DataCollector heartbeats (BL-072, CLAUDE-CONCEPT.md 15.10). Called by
// an external every-minute scheduler (Vercel Hobby cron is daily-only). Same
// shared secret — see lib/cronAuth.ts.
//
// DEPRECATED 2026-09-08 — superseded by the combined `/api/cron/tick` (which
// runs this plus the run-engine tick in one invocation, to cut Neon
// compute). Still functional so the switchover isn't a hard cutover; point
// the scheduler at `/api/cron/tick` and drop this job + the workflow one.

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runHeartbeatTick();
    return NextResponse.json({ ok: true, deprecated: true, use: "/api/cron/tick", ...summary });
  } catch (e) {
    console.error("[heartbeat-tick] failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}

// GET for the external scheduler; POST accepted too for flexibility.
export const GET = handle;
export const POST = handle;
