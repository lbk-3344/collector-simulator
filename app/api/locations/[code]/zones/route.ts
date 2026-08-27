export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserBartenderCredentials, getLocationZones } from "@/lib/bartenderLocations";

// See CLAUDE-CONCEPT.md section 7.3, BACKLOG.md BL-038.
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await getUserBartenderCredentials(session.user.id);
  if (!credentials) {
    return NextResponse.json({ error: "No Bartender connection configured yet — set one up in Settings." }, { status: 400 });
  }

  const result = await getLocationZones(credentials.tenantUrl, credentials.apiKey, params.code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ zones: result.data });
}
