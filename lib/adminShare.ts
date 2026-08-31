import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The ONE deliberate cross-owner mutation in the app (BL-067, §17.4):
// flipping a resource's `shared` flag. Gated purely on ADMIN — not even the
// owner can self-serve sharing. Used by the three `.../[id]/share` routes.
export async function handleShare(
  model: "device" | "workflow" | "itemFeed",
  id: string,
  req: NextRequest
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.shared !== "boolean") {
    return NextResponse.json({ error: "shared (boolean) is required" }, { status: 400 });
  }

  try {
    // No ownerId / visibility check — this is the admin-only exception.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = await (prisma[model] as any).update({ where: { id }, data: { shared: body.shared } });
    return NextResponse.json({ [model]: record });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
