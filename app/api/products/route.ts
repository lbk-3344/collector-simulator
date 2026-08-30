export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listProducts, resolveProductApi } from "@/lib/bartenderProducts";

// Full product list for the Item Feed picker (BL-055). No server-side search
// exists (7.7) — the client fetches this once and filters locally.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const creds = await resolveProductApi(session.user.id);
  if (!creds.ok) return NextResponse.json({ error: creds.error }, { status: creds.status });

  const result = await listProducts(creds.tenantUrl, creds.username, creds.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 502 });

  return NextResponse.json({ products: result.data });
}
