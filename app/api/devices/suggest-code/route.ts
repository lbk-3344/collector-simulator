export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Collector ID suggestion — see CLAUDE-CONCEPT.md section 15.1 (BL-050).
// {locationCode}-{type}-{NN}, NN a zero-padded 2-digit sequence counting
// every existing Device at that Site+Type pair (configured or still a bare
// shell, so numbers never collide with an in-progress one). Pure suggestion,
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

  const count = await prisma.device.count({ where: { locationCode, type } });
  const nn = String(count + 1).padStart(2, "0");

  return NextResponse.json({ code: `${locationCode}-${type}-${nn}` });
}
