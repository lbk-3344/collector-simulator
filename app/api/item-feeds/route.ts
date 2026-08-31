export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildItemFeedData } from "@/lib/itemFeed";
import { visibilityWhere } from "@/lib/ownership";

// Item Feed library (BL-058, CLAUDE-CONCEPT.md 16.1) — reusable batch-of-items
// definitions, not scoped to one Workflow.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const feeds = await prisma.itemFeed.findMany({
    where: visibilityWhere(session.user.id),
    orderBy: { name: "asc" },
    include: { _count: { select: { feedNodes: true } } },
  });

  return NextResponse.json({
    itemFeeds: feeds.map(({ _count, ...f }) => ({ ...f, usageCount: _count.feedNodes })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = buildItemFeedData(body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const itemFeed = await prisma.itemFeed.create({
    data: { ...(result.data as Record<string, unknown>), ownerId: session.user.id } as never,
  });
  return NextResponse.json({ itemFeed });
}
