export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { suggestCollectorId } from "@/lib/deviceCollectorId";

// Collector ID suggestion — see CLAUDE-CONCEPT.md section 15.1 (BL-050).
// The `{locationCode}-{type}-{NN}` sequence itself lives in
// `lib/deviceCollectorId.ts` (shared with the clone route). Pure suggestion,
// never enforced — the config screen always leaves the field editable.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locationCode = req.nextUrl.searchParams.get("locationCode");
  const type = req.nextUrl.searchParams.get("type");
  if (!locationCode || !type) {
    return NextResponse.json({ error: "locationCode and type are required" }, { status: 400 });
  }

  return NextResponse.json({ code: await suggestCollectorId(locationCode, type) });
}
