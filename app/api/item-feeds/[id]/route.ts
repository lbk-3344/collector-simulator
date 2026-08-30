export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildItemFeedData } from "@/lib/itemFeed";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const itemFeed = await prisma.itemFeed.findUnique({
    where: { id: params.id },
    include: { _count: { select: { taskChannelInputs: true } } },
  });
  if (!itemFeed) return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  const { _count, ...rest } = itemFeed;
  return NextResponse.json({ itemFeed: { ...rest, usageCount: _count.taskChannelInputs } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = buildItemFeedData(body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  try {
    const itemFeed = await prisma.itemFeed.update({ where: { id: params.id }, data: result.data as never });
    return NextResponse.json({ itemFeed });
  } catch {
    return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block deletion while any Task Channel still points at this feed (BL-058).
  const usageCount = await prisma.taskChannelInput.count({ where: { itemFeedId: params.id } });
  if (usageCount > 0) {
    return NextResponse.json(
      { error: `This item feed is used by ${usageCount} task channel${usageCount === 1 ? "" : "s"}. Detach it there first.` },
      { status: 409 }
    );
  }

  try {
    await prisma.itemFeed.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
