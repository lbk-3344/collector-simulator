export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// BL-079 (§17.7) — everything the caller has personally hidden from their
// own view, across all three types. Powers Settings → Hidden items. NOT
// admin-gated (contrast /api/admin/shared-resources): every logged-in user
// sees only their own hides. Same { devices, workflows, itemFeeds } +
// `owner` shape as the admin route so the table can be near-identical.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const owner = { select: { id: true, name: true, email: true } };
  const mine = { hiddenBy: { some: { userId } } };

  const [devices, workflows, itemFeeds] = await Promise.all([
    prisma.device.findMany({
      where: mine,
      select: { id: true, name: true, type: true, collectorId: true, locationCode: true, shared: true, owner },
      orderBy: { name: "asc" },
    }),
    prisma.workflow.findMany({
      where: mine,
      select: { id: true, name: true, shared: true, owner },
      orderBy: { name: "asc" },
    }),
    prisma.itemFeed.findMany({
      where: mine,
      select: { id: true, name: true, kind: true, locationCode: true, shared: true, owner },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ devices, workflows, itemFeeds });
}
