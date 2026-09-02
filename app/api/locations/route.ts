export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserBartenderCredentials, listLocations } from "@/lib/bartenderLocations";

// Open to every signed-in role, matching Bartender Connection itself.
// See CLAUDE-CONCEPT.md section 7.3/14, BACKLOG.md BL-037.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await getUserBartenderCredentials(session.user.id);
  if (!credentials) {
    return NextResponse.json({ error: "No Bartender connection configured yet — set one up in Settings." }, { status: 400 });
  }

  const result = await listLocations(session.user.id, credentials.tenantUrl, credentials.apiKey);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ locations: result.data });
}
