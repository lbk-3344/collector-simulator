export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// This app's own simulated Devices (not Bartender's DataCollector concept —
// see CLAUDE-CONCEPT.md section 14.2). Powers the Overview location map
// (BL-038) and Devices-online KPI (BL-039).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locationCode = req.nextUrl.searchParams.get("locationCode");
  if (!locationCode) {
    return NextResponse.json({ error: "locationCode query param is required" }, { status: 400 });
  }

  const devices = await prisma.device.findMany({
    where: { locationCode },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ devices });
}
