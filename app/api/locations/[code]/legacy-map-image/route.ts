export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUserBartenderCredentials,
  getUserBartenderBasicAuthCredentials,
  findFloorForPremiseCode,
  getLegacyFloorMap,
} from "@/lib/bartenderLocations";

// Streams the legacy floor-plan image server-side (see CLAUDE-CONCEPT.md
// section 7.4, BACKLOG.md BL-040/041) — the endpoint it proxies only accepts
// HTTP Basic Auth, so the credentials must stay server-side; the browser's
// <img src> just points here instead of a Bartender URL directly.
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await getUserBartenderCredentials(session.user.id);
  if (!credentials) {
    return NextResponse.json({ error: "No Bartender connection configured yet — set one up in Settings." }, { status: 400 });
  }

  const basicAuth = await getUserBartenderBasicAuthCredentials(session.user.id);
  if (!basicAuth) {
    return NextResponse.json(
      { error: "No Track & Trace username/password configured — set one up in Settings." },
      { status: 400 }
    );
  }

  const floorResult = await findFloorForPremiseCode(credentials.tenantUrl, credentials.apiKey, params.code);
  if (!floorResult.ok) {
    return NextResponse.json({ error: floorResult.error }, { status: 502 });
  }
  if (!floorResult.data) {
    return NextResponse.json(
      { error: "Couldn't find a matching floor location for this site in the legacy Track & Trace API." },
      { status: 502 }
    );
  }

  const imageResult = await getLegacyFloorMap(credentials.tenantUrl, basicAuth.username, basicAuth.password, floorResult.data.id);
  if (!imageResult.ok) {
    return NextResponse.json({ error: imageResult.error }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(imageResult.data.bytes), {
    headers: {
      "Content-Type": imageResult.data.contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
