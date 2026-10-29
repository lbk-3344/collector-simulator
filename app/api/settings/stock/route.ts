export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_IN_STOCK_WINDOW_DAYS, getUserInStockWindowDays } from "@/lib/bartenderInventory";

// Per-user "In stock window" setting — open to every signed-in role, acts on
// the session's own user row only (same pattern as /api/settings/selected-location).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ inStockWindowDays: await getUserInStockWindowDays(session.user.id) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const days = body?.inStockWindowDays;
  if (!Number.isInteger(days) || days < 1 || days > MAX_IN_STOCK_WINDOW_DAYS) {
    return NextResponse.json(
      { error: `In stock window must be a whole number of days between 1 and ${MAX_IN_STOCK_WINDOW_DAYS}.` },
      { status: 400 }
    );
  }

  await prisma.user.update({ where: { id: session.user.id }, data: { inStockWindowDays: days } });
  return NextResponse.json({ ok: true, inStockWindowDays: days });
}
