import { prisma } from "@/lib/prisma";
import { waitUntil } from "@/lib/vercelWaitUntil";

// Centralised logging wrapper around fetch for every outgoing Bartender call
// (BL-076, CLAUDE-CONCEPT.md section 19). Wraps fetch 1:1 — the only extra
// arguments are `userId` (the attributed owner: interactive caller, or the
// BL-074b-resolved cron owner) and a human-readable `operation` label.
//
// A raw `apikey` / `authorization` header value is NEVER written to a log
// row — it's replaced with a placeholder before the row is created. Bodies
// are truncated ~20KB; binary responses are stored as a byte-count note.
// Logging is best-effort: a logging failure never breaks the Bartender call.

const MAX_BODY_CHARS = 20_000;
const MAX_ROWS_PER_USER = 500;
const REDACTED_HEADER_KEYS = ["apikey", "authorization"];
const REDACTED_VALUE = "***redacted***";
// The prune check (a SELECT + maybe a DELETE) ran on every single call —
// during a busy run-engine tick that's dozens of extra queries just to keep
// a 500-row cap. Every call still gets logged; only the prune *check* is
// sampled (performance review 2026-09-04) — on average it still runs often
// enough to keep the table close to the cap, just with far less overhead.
const PRUNE_SAMPLE_RATE = 0.05;

function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = REDACTED_HEADER_KEYS.includes(key.toLowerCase()) ? REDACTED_VALUE : value;
  }
  return out;
}

function truncate(body: string | null | undefined): string | null {
  if (body == null) return null;
  return body.length > MAX_BODY_CHARS
    ? body.slice(0, MAX_BODY_CHARS) + `\n...[truncated, ${body.length} bytes total]`
    : body;
}

export async function loggedFetch(
  userId: string,
  operation: string,
  url: string,
  init: RequestInit & { headers?: Record<string, string> },
  opts?: { binaryResponse?: boolean }
): Promise<Response> {
  const startedAt = Date.now();
  const requestHeaders = redactHeaders(init.headers);
  const requestBody =
    typeof init.body === "string" ? truncate(init.body) : init.body ? "[non-string body, not logged]" : null;

  let response: Response | null = null;
  let errorMessage: string | null = null;
  let responseBody: string | null = null;

  try {
    response = await fetch(url, init);
    responseBody = opts?.binaryResponse
      ? `[binary, ${response.headers.get("content-length") ?? "unknown"} bytes, not logged]`
      : truncate(await response.clone().text());
    return response;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    // Best-effort — a logging failure must never break the underlying call.
    // Skip entirely if we have no user to attribute the call to. Wrapped in
    // waitUntil() so the write (and, when sampled, the prune) actually
    // finishes even though the response has already been returned above —
    // otherwise Vercel can freeze the instance right after the response is
    // sent and silently drop a log row mid-write.
    if (userId) {
      const write = prisma.apiCallLog
        .create({
          data: {
            userId,
            operation,
            method: init.method ?? "GET",
            url,
            requestHeaders,
            requestBody,
            responseStatus: response?.status ?? null,
            responseBody,
            errorMessage,
            durationMs: Date.now() - startedAt,
          },
        })
        .then(() => {
          // Inline prune, sampled (not every call) — keep the newest
          // MAX_ROWS_PER_USER, drop anything older.
          if (Math.random() >= PRUNE_SAMPLE_RATE) return null;
          return prisma.apiCallLog
            .findMany({
              where: { userId },
              orderBy: { createdAt: "desc" },
              skip: MAX_ROWS_PER_USER,
              select: { id: true },
            })
            .then((stale) =>
              stale.length ? prisma.apiCallLog.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } }) : null
            );
        })
        .catch((e) => console.error("[apiCallLog] failed to write/prune log row", e));
      waitUntil(write);
    }
  }
}
