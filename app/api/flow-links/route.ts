export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Flow Link CRUD (BL-059) — a Channel-to-Channel edge in a Workflow graph.
// Driven by the Part 2 canvas; no dedicated UI in this batch.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFlowLinkData(body: any) {
  const req = (k: string) => (typeof body?.[k] === "string" && body[k] ? body[k] : null);
  const workflowId = req("workflowId");
  const sourceTaskId = req("sourceTaskId");
  const sourceChannelId = req("sourceChannelId");
  const targetTaskId = req("targetTaskId");
  const targetChannelId = req("targetChannelId");
  if (!workflowId || !sourceTaskId || !sourceChannelId || !targetTaskId || !targetChannelId) {
    return { error: "workflowId, source/target taskId and channelId are all required" as string };
  }
  const int = (v: unknown) => (typeof v === "number" && v >= 0 ? Math.round(v) : 0);
  const strArr = (v: unknown) => {
    if (!Array.isArray(v)) return undefined;
    const arr = v.map((s) => String(s).trim()).filter(Boolean);
    return arr.length ? arr : undefined;
  };
  return {
    data: {
      workflowId,
      sourceTaskId,
      sourceChannelId,
      targetTaskId,
      targetChannelId,
      delayMinSeconds: int(body.delayMinSeconds),
      delayMaxSeconds: int(body.delayMaxSeconds),
      ...(strArr(body.filterGtins) ? { filterGtins: strArr(body.filterGtins) } : {}),
      ...(strArr(body.filterCategoryCodes) ? { filterCategoryCodes: strArr(body.filterCategoryCodes) } : {}),
      isElse: body.isElse === true,
    },
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workflowId = req.nextUrl.searchParams.get("workflowId");
  const flowLinks = await prisma.flowLink.findMany({
    where: workflowId ? { workflowId } : undefined,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ flowLinks });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = buildFlowLinkData(body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  try {
    // A Channel can have any number of FeedLinks/FlowLinks targeting it —
    // no exclusive-choice bookkeeping (BL-059 revised).
    const flowLink = await prisma.flowLink.create({ data: result.data });
    return NextResponse.json({ flowLink });
  } catch {
    return NextResponse.json({ error: "Source or target task not found" }, { status: 404 });
  }
}
