export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibilityWhere } from "@/lib/ownership";

// FeedNode CRUD (BL-059 revised) — one placement of a reusable ItemFeed onto
// one Workflow's canvas. The same ItemFeed can be placed many times.
// Visibility/ownership inherited from the parent Workflow (BL-067).

const FEED_NODE_INCLUDE = {
  itemFeed: { select: { id: true, name: true, kind: true, gtins: true, presentMatchMode: true } },
  feedLinks: true,
} as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflowId = req.nextUrl.searchParams.get("workflowId");
  const feedNodes = await prisma.feedNode.findMany({
    where: {
      workflow: visibilityWhere(session.user.id),
      ...(workflowId ? { workflowId } : {}),
    },
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

  // Same-owner composition rule as POST /api/tasks (BL-067, §17.3): the
  // caller must own BOTH the Workflow and the ItemFeed — sharing doesn't
  // grant the right to place someone else's feed on your canvas.
  const [workflow, itemFeed] = await Promise.all([
    prisma.workflow.findUnique({ where: { id: workflowId }, select: { ownerId: true } }),
    prisma.itemFeed.findUnique({ where: { id: itemFeedId }, select: { ownerId: true } }),
  ]);
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (!itemFeed) return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  if (workflow.ownerId !== session.user.id) {
    return NextResponse.json({ error: "You can only add feed nodes to your own workflows." }, { status: 403 });
  }
  if (itemFeed.ownerId !== session.user.id) {
    return NextResponse.json({ error: "You can only place your own item feeds." }, { status: 403 });
  }
  if (workflow.ownerId !== itemFeed.ownerId) {
    return NextResponse.json({ error: "Item feeds and workflows must belong to the same owner." }, { status: 403 });
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
