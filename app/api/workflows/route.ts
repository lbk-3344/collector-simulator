export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibilityWhere } from "@/lib/ownership";

// Workflow CRUD. The canvas editor (BL-060) is the real authoring surface;
// this list feeds /workflows and its detail page.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflows = await prisma.workflow.findMany({
    where: visibilityWhere(session.user.id),
    orderBy: { name: "asc" },
    include: { _count: { select: { tasks: true, flowLinks: true } } },
  });
  return NextResponse.json({
    workflows: workflows.map(({ _count, ...w }) => ({ ...w, taskCount: _count.tasks, flowLinkCount: _count.flowLinks })),
    currentUserId: session.user.id,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // New workflows start STOPPED — nothing to run until Tasks are wired up.
  const workflow = await prisma.workflow.create({
    data: { name, status: "STOPPED", ownerId: session.user.id },
  });
  return NextResponse.json({ workflow });
}
