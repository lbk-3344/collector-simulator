export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/workflowRun";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

// The run engine's heartbeat (BL-061, CLAUDE-CONCEPT.md 16.5). Called by an
// external every-minute scheduler (Vercel Hobby cron is daily-only — Phase 0)
// with a shared secret — see lib/cronAuth.ts for the accepted header forms
// and the constant-time comparison.

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runTick();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[workflow-tick] failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}

// GET for the external scheduler; POST accepted too for flexibility.
export const GET = handle;
export const POST = handle;
