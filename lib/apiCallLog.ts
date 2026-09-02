import { prisma } from "@/lib/prisma";

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
    // Skip entirely if we have no user to attribute the call to.
    if (userId) {
      prisma.apiCallLog
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
        .then(() =>
          // Inline prune, best-effort, no separate job — keep the newest
          // MAX_ROWS_PER_USER, drop anything older.
          prisma.apiCallLog.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip: MAX_ROWS_PER_USER,
            select: { id: true },
          })
        )
        .then((stale) =>
          stale.length
            ? prisma.apiCallLog.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } })
            : null
        )
        .catch((e) => console.error("[apiCallLog] failed to write/prune log row", e));
    }
  }
}
