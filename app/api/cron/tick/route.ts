export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runCombinedTick } from "@/lib/cronTick";

// The single run-engine + heartbeat tick (2026-09-08). Replaces the two
// per-minute jobs against /api/cron/workflow-tick and
// /api/cron/heartbeat-tick — point the external scheduler at this one URL
// instead (same CRON_SECRET, via `x-cron-secret` or `Authorization: Bearer`,
// see lib/cronAuth.ts). The old two routes still work during the switchover.
// See lib/cronTick.ts for why (Neon free-tier compute quota).
async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runCombinedTick();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
