export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUserBartenderCredentials,
  getUserBartenderBasicAuthCredentials,
  getLocationMap,
  findFloorForPremiseCode,
} from "@/lib/bartenderLocations";

// No floor plan (404 from the gateway, or SUPPLIER/CUSTOMER-type locations
// that don't have one) is a normal outcome, returned as { hasMap: false } —
// not an error. See CLAUDE-CONCEPT.md section 7.3, BACKLOG.md BL-038.
//
// A 403 specifically (not 401, not a network error, not the already-handled
// 404) falls back to the temporary legacy map workaround (section 7.4,
// BL-040/041) when the user has Basic Auth credentials configured — this is
// a real permission-scope gap on Bartender's side, not fixable here.
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await getUserBartenderCredentials(session.user.id);
  if (!credentials) {
    return NextResponse.json({ error: "No Bartender connection configured yet — set one up in Settings." }, { status: 400 });
  }

  const result = await getLocationMap(credentials.tenantUrl, credentials.apiKey, params.code);

  if (!result.ok) {
    if (result.status === 403) {
      const basicAuth = await getUserBartenderBasicAuthCredentials(session.user.id);
      if (!basicAuth) {
        return NextResponse.json(
          {
            error: `${result.error} — add a Track & Trace username/password in Settings to enable the temporary floor-plan workaround.`,
          },
          { status: 502 }
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

      // Don't fetch the image bytes here — just confirm the floor is
      // reachable and let the browser's <img> hit the streaming route below
      // (which re-does the Basic Auth fetch server-side).
      return NextResponse.json({
        hasMap: true,
        map: { mapUrl: `/api/locations/${encodeURIComponent(params.code)}/legacy-map-image` },
      });
    }

    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  if (!result.data) {
    return NextResponse.json({ hasMap: false });
  }

  return NextResponse.json({ hasMap: true, map: result.data });
}
