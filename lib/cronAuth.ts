import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// Shared authorization check for the two CRON_SECRET-guarded routes
// (workflow-tick, heartbeat-tick — CLAUDE-CONCEPT.md 16.5/15.10). Was
// duplicated per-route with a plain `===` comparison; constant-time now
// (security review 2026-09-04) so comparing the header against the secret
// doesn't leak timing information about how much of it matched. Accepts
// either `x-cron-secret: <CRON_SECRET>` or `Authorization: Bearer
// <CRON_SECRET>` (Vercel Cron's own convention), so swapping to native
// Vercel Cron later needs no code change.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch — differing length already
  // means "not equal", and revealing that alone isn't a meaningful leak.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("x-cron-secret");
  if (header && safeEqual(header, secret)) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer && safeEqual(bearer, secret)) return true;

  return false;
}
