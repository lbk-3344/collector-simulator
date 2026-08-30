export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listCategories, resolveProductApi } from "@/lib/bartenderProducts";

// Category tree for the Item Feed picker's browse-by-category mode (BL-055).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const creds = await resolveProductApi(session.user.id);
  if (!creds.ok) return NextResponse.json({ error: creds.error }, { status: creds.status });

  const result = await listCategories(creds.tenantUrl, creds.username, creds.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 502 });

  return NextResponse.json({ categories: result.data });
}
