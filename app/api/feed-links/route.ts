export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibilityWhere } from "@/lib/ownership";

// FeedLink CRUD (BL-059 revised) — edge from a FeedNode to one Task Channel.
// Firing cadence (fireIntervalSeconds) lives here; a Channel can have any
// number of FeedLinks. Visibility/ownership via the parent Workflow (BL-067).

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workflowId = req.nextUrl.searchParams.get("workflowId");
  const feedLinks = await prisma.feedLink.findMany({
    where: {
      workflow: visibilityWhere(session.user.id),
      ...(workflowId ? { workflowId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ feedLinks });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const s = (k: string) => (typeof body?.[k] === "string" && body[k] ? body[k] : null);
  const workflowId = s("workflowId");
  const feedNodeId = s("feedNodeId");
  const targetTaskId = s("targetTaskId");
  const targetChannelId = s("targetChannelId");
  if (!workflowId || !feedNodeId || !targetTaskId || !targetChannelId) {
    return NextResponse.json(
      { error: "workflowId, feedNodeId, targetTaskId and targetChannelId are required" },
      { status: 400 }
    );
  }
  const fireIntervalSeconds =
    typeof body.fireIntervalSeconds === "number" && body.fireIntervalSeconds > 0
      ? Math.round(body.fireIntervalSeconds)
      : 60;

  // Owner check on the parent Workflow, and both endpoints must live under
  // that same Workflow (BL-067 — no cross-workflow or cross-owner wiring).
  const [workflow, feedNode, targetTask] = await Promise.all([
    prisma.workflow.findUnique({ where: { id: workflowId }, select: { ownerId: true } }),
    prisma.feedNode.findUnique({ where: { id: feedNodeId }, select: { workflowId: true } }),
    prisma.task.findUnique({ where: { id: targetTaskId }, select: { workflowId: true } }),
  ]);
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (workflow.ownerId !== session.user.id) {
    return NextResponse.json({ error: "You can only edit your own workflows." }, { status: 403 });
  }
  if (!feedNode || !targetTask) {
    return NextResponse.json({ error: "Feed node or task not found" }, { status: 404 });
  }
  if (feedNode.workflowId !== workflowId || targetTask.workflowId !== workflowId) {
    return NextResponse.json({ error: "Feed node and task must belong to this workflow." }, { status: 400 });
  }

  try {
    const feedLink = await prisma.feedLink.create({
      data: { workflowId, feedNodeId, targetTaskId, targetChannelId, fireIntervalSeconds },
    });
    return NextResponse.json({ feedLink });
  } catch {
    return NextResponse.json({ error: "Feed node or task not found" }, { status: 404 });
  }
}
