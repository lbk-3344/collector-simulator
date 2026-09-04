export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hideResource, unhideResource } from "@/lib/hiddenResources";

// BL-079 (§17.7) — hide (POST) / restore (DELETE) a shared-not-owned
// Workflow from the caller's own view. Personal + sticky; never touches
// `shared`.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await hideResource("workflow", session.user.id, params.id);
  if (!res.ok) return NextResponse.json({ error: "Workflow not found" }, { status: res.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await unhideResource("workflow", session.user.id, params.id);
  return NextResponse.json({ ok: true });
}
