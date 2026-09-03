export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/ownership";

// Activity log for one Workflow (BL-061 Phase 5) — recent SimulatedReads,
// newest first. No live token animation; this is the "automation is
// happening" visibility.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wf = await prisma.workflow.findUnique({ where: { id: params.id }, select: { ownerId: true, shared: true } });
  if (!wf || (!isOwner(wf, session.user.id) && !wf.shared)) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);

  const [reads, tasks] = await Promise.all([
    prisma.simulatedRead.findMany({
      where: { workflowId: params.id },
      orderBy: { occurredAt: "desc" },
      take: limit,
    }),
    prisma.task.findMany({
      where: { workflowId: params.id },
      select: { id: true, name: true, device: { select: { name: true, channels: true } } },
    }),
  ]);

  const taskName = new Map(tasks.map((t) => [t.id, t.name || t.device.name]));
  // taskId::channelId → the channel's freeform name, when it has one.
  const channelName = new Map<string, string>();
  for (const t of tasks) {
    const chans = Array.isArray(t.device.channels) ? (t.device.channels as { id?: string; name?: string }[]) : [];
    for (const c of chans) {
      if (c?.id && c?.name) channelName.set(`${t.id}::${c.id}`, c.name);
    }
  }
  return NextResponse.json({
    reads: reads.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      taskName: taskName.get(r.taskId) ?? "(removed task)",
      channelId: r.channelId,
      channelName: channelName.get(`${r.taskId}::${r.channelId}`) ?? null,
      itemCount: Array.isArray(r.items) ? r.items.length : 0,
      gtin: r.gtin,
      occurredAt: r.occurredAt,
    })),
  });
}
