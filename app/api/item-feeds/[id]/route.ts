export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildItemFeedData } from "@/lib/itemFeed";
import { isOwner } from "@/lib/ownership";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const itemFeed = await prisma.itemFeed.findUnique({
    where: { id: params.id },
    include: { _count: { select: { feedNodes: true } } },
  });
  if (!itemFeed || (!isOwner(itemFeed, session.user.id) && !itemFeed.shared)) {
    return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  }
  const { _count, ...rest } = itemFeed;
  return NextResponse.json({ itemFeed: { ...rest, usageCount: _count.feedNodes } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await prisma.itemFeed.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!owned) return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  if (!isOwner(owned, session.user.id)) {
    return NextResponse.json({ error: "You can only edit your own item feeds." }, { status: 403 });
  }

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

  const owned = await prisma.itemFeed.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!owned) return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  if (!isOwner(owned, session.user.id)) {
    return NextResponse.json({ error: "You can only delete your own item feeds." }, { status: 403 });
  }

  // Deleting the definition cascade-removes its FeedNodes/FeedLinks too
  // (schema onDelete: Cascade) — the UI warns with the usage count first.
  const usageCount = await prisma.feedNode.count({ where: { itemFeedId: params.id } });
  try {
    await prisma.itemFeed.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, removedFeedNodes: usageCount });
}
