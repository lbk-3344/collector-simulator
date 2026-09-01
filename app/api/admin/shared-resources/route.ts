export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The one deliberate cross-owner LIST in the app (BL-067, §17.4) — powers
// Part 2's admin-only "Shared resources" screen. No visibility filter;
// ADMIN-gated only. Do not reuse this unfiltered pattern elsewhere.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const owner = { select: { id: true, name: true, email: true } };
  const [devices, workflows, itemFeeds] = await Promise.all([
    prisma.device.findMany({
      select: { id: true, name: true, type: true, collectorId: true, locationCode: true, shared: true, owner },
      orderBy: { name: "asc" },
    }),
    prisma.workflow.findMany({ select: { id: true, name: true, shared: true, owner }, orderBy: { name: "asc" } }),
    prisma.itemFeed.findMany({
      select: { id: true, name: true, kind: true, locationCode: true, shared: true, owner },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ devices, workflows, itemFeeds });
}
