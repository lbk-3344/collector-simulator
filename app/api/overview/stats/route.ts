export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Overview KPI cards (CLAUDE-CONCEPT.md §14.4): "Workflows running" and
// "Serialized items generated (last 24h)". Both are tenant-global — workflows
// aren't scoped to a site the way the Devices-online card is.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [running, total, itemRows] = await Promise.all([
    prisma.workflow.count({ where: { status: "RUNNING" } }),
    prisma.workflow.count(),
    // Distinct item identifiers seen in any SimulatedRead in the last 24h —
    // dedupes an item counted once per task it passes through, and covers
    // NEW (minted), PRESENT (pulled) and FIXED feeds uniformly.
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT elem) AS count
      FROM "SimulatedRead"
      CROSS JOIN LATERAL jsonb_array_elements_text("items") AS elem
      WHERE "occurredAt" >= ${since} AND jsonb_typeof("items") = 'array'
    `,
  ]);

  return NextResponse.json({
    workflows: { running, total },
    itemsGenerated24h: Number(itemRows[0]?.count ?? 0),
  });
}
