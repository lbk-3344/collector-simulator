export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Persists the Overview site selector's choice per user — see
// CLAUDE-CONCEPT.md section 14, BACKLOG.md BL-037. Same auth/session pattern
// as POST /api/settings/bartender: acts on the session's own user row only.
// The list pages (Devices, Item Feeds) use this to default their Site filter
// to the same site the Overview selector is on (BUG #15).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { selectedLocationCode: true },
  });
  return NextResponse.json({ locationCode: user?.selectedLocationCode ?? null });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const locationCode = typeof body?.locationCode === "string" ? body.locationCode : null;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { selectedLocationCode: locationCode },
  });

  return NextResponse.json({ ok: true });
}
