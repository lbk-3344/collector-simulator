export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/workflowRun";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

// The run engine tick (BL-061, CLAUDE-CONCEPT.md 16.5). Called by an
// external every-minute scheduler (Vercel Hobby cron is daily-only — Phase 0)
// with a shared secret — see lib/cronAuth.ts for the accepted header forms
// and the constant-time comparison.
//
// DEPRECATED 2026-09-08 — superseded by the combined `/api/cron/tick` (which
// runs this plus the heartbeat tick in one invocation, to cut Neon compute).
// Still fully functional so the switchover isn't a hard cutover; point the
// scheduler at `/api/cron/tick` and drop this job + the heartbeat one.

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runTick();
    return NextResponse.json({ ok: true, deprecated: true, use: "/api/cron/tick", ...summary });
  } catch (e) {
    console.error("[workflow-tick] failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}

// GET for the external scheduler; POST accepted too for flexibility.
export const GET = handle;
export const POST = handle;
