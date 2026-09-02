export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUserBartenderCredentials,
  getUserBartenderBasicAuthCredentials,
} from "@/lib/bartenderLocations";
import { searchEpcisEvents } from "@/lib/bartenderEpcis";

// History page — EPCIS-events tab (BL-076a, §7.9/§19). Uses the caller's own
// stored Track & Trace username/password (Basic auth), same as the legacy
// Product API. `?location=<code>|all` — `all` (or absent) drops the premise
// filter.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "PENDING") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getUserBartenderCredentials(session.user.id).catch(() => null);
  const basic = await getUserBartenderBasicAuthCredentials(session.user.id).catch(() => null);
  if (!tenant?.tenantUrl || !basic) {
    return NextResponse.json(
      { error: "Set your Track & Trace URL, username and password in Settings → Bartender Connection first." },
      { status: 400 }
    );
  }

  const location = req.nextUrl.searchParams.get("location");
  const result = await searchEpcisEvents(session.user.id, tenant.tenantUrl, basic.username, basic.password, {
    locationCode: location && location !== "all" ? location : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 502 });
  }
  return NextResponse.json({ events: result.data });
}
