export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// FeedNode CRUD (BL-059 revised) — one placement of a reusable ItemFeed onto
// one Workflow's canvas. The same ItemFeed can be placed many times.

const FEED_NODE_INCLUDE = {
  itemFeed: { select: { id: true, name: true, kind: true, gtins: true, presentMatchMode: true } },
  feedLinks: true,
} as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflowId = req.nextUrl.searchParams.get("workflowId");
  const feedNodes = await prisma.feedNode.findMany({
    where: workflowId ? { workflowId } : undefined,
    include: FEED_NODE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ feedNodes });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const workflowId = typeof body?.workflowId === "string" ? body.workflowId : "";
  const itemFeedId = typeof body?.itemFeedId === "string" ? body.itemFeedId : "";
  if (!workflowId || !itemFeedId) {
    return NextResponse.json({ error: "workflowId and itemFeedId are required" }, { status: 400 });
  }

  try {
    const feedNode = await prisma.feedNode.create({
      data: {
        workflowId,
        itemFeedId,
        positionX: typeof body.positionX === "number" ? Math.round(body.positionX) : null,
        positionY: typeof body.positionY === "number" ? Math.round(body.positionY) : null,
      },
      include: FEED_NODE_INCLUDE,
    });
    return NextResponse.json({ feedNode });
  } catch {
    return NextResponse.json({ error: "Workflow or item feed not found" }, { status: 404 });
  }
}
