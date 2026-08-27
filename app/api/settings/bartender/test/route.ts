export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

// "Test connection" — proxies the call server-side so the API key never
// reaches the browser's network tab. See CLAUDE-CONCEPT.md section 7.2,
// BACKLOG.md BL-033.
//
// Confirmed request (Luc, 2026-08-27):
//   GET {tenantUrl}/statemachine-api-configuration/rest/configuration/locations?level=premise
//   Header: apikey: <key>
//
// Response shape (observed against the sandbox tenant): a plain JSON array
// of location objects (not wrapped in { data: [...] }), each with at least
// id/code/name/level/type — see CLAUDE-CONCEPT.md section 7.2 for the full
// shape now that it's documented.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const bodyTenantUrl = typeof body?.tenantUrl === "string" ? body.tenantUrl.trim() : "";
  const bodyApiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

  let tenantUrl = bodyTenantUrl;
  let apiKey = bodyApiKey;

  // Fall back to the saved values for whichever of tenantUrl/apiKey wasn't
  // supplied unsaved — lets the UI test either an in-progress edit or the
  // already-saved connection with the same button.
  if (!tenantUrl || !apiKey) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { bartenderTenantUrl: true, bartenderApiKeyCiphertext: true },
    });
    if (!tenantUrl) tenantUrl = user?.bartenderTenantUrl ?? "";
    if (!apiKey && user?.bartenderApiKeyCiphertext) {
      try {
        apiKey = decrypt(user.bartenderApiKeyCiphertext);
      } catch {
        return NextResponse.json({ ok: false, error: "Stored API key could not be decrypted." }, { status: 500 });
      }
    }
  }

  if (!tenantUrl || !apiKey) {
    return NextResponse.json({ ok: false, error: "Enter a tenant URL and API key first." }, { status: 400 });
  }

  const url = `${tenantUrl.replace(/\/+$/, "")}/statemachine-api-configuration/rest/configuration/locations?level=premise`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { apikey: apiKey }, cache: "no-store" });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach that tenant URL — check it's correct." });
  }

  if (response.status === 401 || response.status === 403) {
    return NextResponse.json({ ok: false, error: "Bartender rejected the API key (unauthorized)." });
  }
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: `Bartender returned an error (HTTP ${response.status}).` });
  }

  const data = await response.json().catch(() => null);
  if (!Array.isArray(data)) {
    return NextResponse.json({ ok: false, error: "Unexpected response shape from Bartender." });
  }

  return NextResponse.json({ ok: true, locationCount: data.length });
}
