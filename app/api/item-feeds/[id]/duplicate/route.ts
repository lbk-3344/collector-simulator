export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/ownership";

// One clone operation, two callers: the Item Feeds-list "Duplicate" row
// action and the Workflow canvas' right-click Copy/Paste/Duplicate menu on a
// Feed Node (BL-071). See CLAUDE-CONCEPT.md section 16.9 (mirrors 15.9).
//
// Unlike placing a feed again (dragging from the palette → a new FeedNode
// pointing at the SAME ItemFeed id), this creates a brand-new independent
// ItemFeed row: own id, own name (" (Copy)" suffix), owned by the caller,
// editable afterward without touching the original. No FeedNode is created
// here — that's the canvas caller's job. An ItemFeed has no position of its
// own, so there is no request body.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const source = await prisma.itemFeed.findUnique({ where: { id: params.id } });
  // Visibility only, not ownership — cloning a *shared* feed you don't own is
  // the intended cross-owner-composition escape hatch (§17.3). The clone's
  // ownerId is always the caller (below), and shared is always false.
  if (!source || (!isOwner(source, session.user.id) && !source.shared)) {
    return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  }

  const itemFeed = await prisma.itemFeed.create({
    data: {
      ownerId: session.user.id,
      shared: false,
      name: `${source.name} (Copy)`,
      kind: source.kind,
      categoryCode: source.categoryCode,
      gs1Standard: source.gs1Standard,
      presentMatchMode: source.presentMatchMode,
      quantityMin: source.quantityMin,
      quantityMax: source.quantityMax,
      locationCode: source.locationCode,
      zoneCode: source.zoneCode,
      // Json columns: pass the source value through, or omit (column default
      // is null) — never pass a bare `null` for a Json? field.
      ...(source.gtins !== null ? { gtins: source.gtins as never } : {}),
      ...(source.fixedItems !== null ? { fixedItems: source.fixedItems as never } : {}),
    },
  });

  return NextResponse.json({ itemFeed });
}
