export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Polled every 30s by the /auth/pending waiting page (see CLAUDE-CONCEPT.md
// section 4) to detect once an admin has validated the signed-in user.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ role: null });
  return NextResponse.json({ role: session.user.role });
}
