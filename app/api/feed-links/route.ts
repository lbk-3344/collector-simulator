export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// FeedLink CRUD (BL-059 revised) — edge from a FeedNode to one Task Channel.
// Firing cadence (fireIntervalSeconds) lives here; a Channel can have any
// number of FeedLinks.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workflowId = req.nextUrl.searchParams.get("workflowId");
  const feedLinks = await prisma.feedLink.findMany({
    where: workflowId ? { workflowId } : undefined,
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

  try {
    const feedLink = await prisma.feedLink.create({
      data: { workflowId, feedNodeId, targetTaskId, targetChannelId, fireIntervalSeconds },
    });
    return NextResponse.json({ feedLink });
  } catch {
    return NextResponse.json({ error: "Feed node or task not found" }, { status: 404 });
  }
}
