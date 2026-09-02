export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// History page — endpoint-calls tab list (BL-076, §19). The caller's own last
// 100 logged Bartender calls; bodies are NOT included here (they load on
// demand via the [id] route when a row is opened).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "PENDING") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const calls = await prisma.apiCallLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      operation: true,
      method: true,
      url: true,
      responseStatus: true,
      errorMessage: true,
      durationMs: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ calls });
}
