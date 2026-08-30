export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/workflowRun";

// The run engine's heartbeat (BL-061, CLAUDE-CONCEPT.md 16.5). Called by an
// external every-minute scheduler (Vercel Hobby cron is daily-only — Phase 0)
// with a shared secret. Accepts either `x-cron-secret: <CRON_SECRET>` or
// `Authorization: Bearer <CRON_SECRET>` (Vercel Cron's own convention), so
// swapping to native Vercel Cron later needs no code change.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret || bearer === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
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
