export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

// Per-user Bartender connection settings — open to every signed-in role, not
// admin-gated, since each user points at their own tenant. See
// CLAUDE-CONCEPT.md section 7.1, BACKLOG.md BL-032.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      bartenderTenantUrl: true,
      bartenderApiKeyLast4: true,
      bartenderUsername: true,
      bartenderPasswordCiphertext: true,
    },
  });

  return NextResponse.json({
    tenantUrl: user?.bartenderTenantUrl ?? null,
    apiKeyLast4: user?.bartenderApiKeyLast4 ?? null,
    username: user?.bartenderUsername ?? null,
    hasPassword: Boolean(user?.bartenderPasswordCiphertext),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const tenantUrl = typeof body?.tenantUrl === "string" ? body.tenantUrl : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  const username = typeof body?.username === "string" ? body.username : undefined;
  const password = typeof body?.password === "string" ? body.password.trim() : "";

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      bartenderTenantUrl: tenantUrl,
      // Only touch the key if the user actually typed a new one — an
      // omitted/empty apiKey means "keep the existing key unchanged".
      ...(apiKey && {
        bartenderApiKeyCiphertext: encrypt(apiKey),
        bartenderApiKeyLast4: apiKey.slice(-4),
      }),
      // Legacy map workaround credentials (BL-040) — optional, additive.
      // username follows tenantUrl's semantics (only written if the field
      // was included at all); password follows apiKey's (only touched when
      // a new value was actually typed).
      ...(username !== undefined && { bartenderUsername: username }),
      ...(password && { bartenderPasswordCiphertext: encrypt(password) }),
    },
  });

  return NextResponse.json({ ok: true });
}
