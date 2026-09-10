import { prisma } from "@/lib/prisma";
import { getDeviceState } from "@/lib/deviceState";

// Cron skip-gate (2026-09-08, §13/§16.5). The external scheduler hits
// `/api/cron/tick` every ~minute so a RUNNING workflow keeps ~60s
// reactivity. But every tick that touches Postgres keeps the Neon compute
// awake — and on the Launch plan autosuspend can't go below 5 min, so a
// per-minute DB-touching tick pins the compute 24/7 even when nothing is
// running (that's what exhausted the free-tier quota, §13 2026-09-08).
//
// This gate lets an idle tick return WITHOUT any Prisma call: the earliest
// moment the engine next has real work to do is kept in a small key-value
// store that lives outside Postgres (`nextDueAt`, epoch-ms). While that
// instant is in the future every tick is a single out-of-band read and the
// Neon compute autosuspends; once it's in the past the full tick runs and
// rewrites it.
//
// Store: **Upstash Redis** (Vercel Marketplace), talked to over its documented
// REST API with plain `fetch` — no SDK (same dependency-free reasoning as
// `lib/vercelWaitUntil.ts`). This was a Vercel Global Config item until
// 2026-09-09 — but Global Config's Hobby plan allows only 100 writes per
// *month*, and this key is rewritten on every real tick, so a couple of hours
// of cumulative workflow runtime exhausted the quota. Upstash's free tier
// (~500K commands/month) absorbs a per-minute read+write with room to spare,
// and a Redis REST read still never touches Postgres, so the autosuspend
// property that makes the gate worthwhile is unchanged.
//
// `nextDueAt` is (re)written at the end of every real tick, and collapsed to
// "now" by bustCronClock() from the mutations that create imminent work
// (workflow start, a device coming online) so a just-started workflow is
// picked up within one tick.
//
// Fail-open everywhere: if the store isn't configured, or any read/write
// errors, the gate is inert and every tick runs in full — exactly the
// pre-gate behaviour. It engages once the Upstash REST URL + write token are
// present in the environment (Vercel injects them when the integration is
// connected to the project — see upstashCreds() for the accepted var names).

// One store can back several deployments (Preview + Production share it), so
// the key is scoped per Vercel environment — otherwise staging's idle
// "nothing due for 30 min" would make production skip while a workflow runs,
// and vice versa. Production keeps the bare name; others get a suffix.
function itemKey(): string {
  const env = process.env.VERCEL_ENV;
  return env && env !== "production"
    ? `cronclock:nextDueAt_${env}`
    : "cronclock:nextDueAt";
}
// While nothing is scheduled, park the clock this far ahead. Bounds the
// worst-case "a mutation we don't bust on made work due" latency, and keeps
// one real (DB-touching) tick happening on that cadence as a safety re-sync.
// Must be comfortably over Neon's 5-min autosuspend so the compute still gets
// a real idle gap between those re-syncs.
const IDLE_HORIZON_MS = 30 * 60_000;
// Run the real tick slightly before the stored instant, never after.
const SKEW_MS = 2_000;
// TTL on the stored key — a self-heal backstop. If the writer stops for any
// reason, the key expires and the next tick reads null → runs in full →
// rewrites it. Comfortably longer than IDLE_HORIZON_MS so a normal idle
// re-sync always refreshes it well before it can expire.
const KEY_TTL_SECONDS = 60 * 60;

// Resolve the Upstash REST URL + write token from the environment. Vercel's
// Upstash integration names them after a project-chosen prefix: a bare
// connect gives `UPSTASH_REDIS_REST_URL` / `_TOKEN`, but with a prefix set
// (the default when the store is named) they arrive as e.g.
// `UPSTASH_REDIS_KV_REST_API_URL` / `..._KV_REST_API_TOKEN`. Accept either:
// the well-known names first, then any `*REST_API_URL` var pointing at an
// upstash.io host paired with its sibling `*REST_API_TOKEN` (never the
// `*READ_ONLY_TOKEN` — the gate needs writes).
function upstashCreds(): { url: string; token: string } | null {
  const env = process.env;
  for (const [url, token] of [
    [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN],
    [env.KV_REST_API_URL, env.KV_REST_API_TOKEN],
  ] as const) {
    if (url && token) return { url, token };
  }
  for (const [key, value] of Object.entries(env)) {
    if (
      typeof value === "string" &&
      /REST_API_URL$/.test(key) &&
      /^https:\/\/[^/\s]*upstash\.io/i.test(value)
    ) {
      const token = env[key.replace(/URL$/, "TOKEN")];
      if (token) return { url: value, token };
    }
  }
  return null;
}

// One Redis command per request: POST the base URL with a JSON-array body
// (["GET", key] / ["SET", key, value, "EX", ttl]) and a bearer token.
// Response shape: { result } on success, { error } on a command error.
// Returns undefined when the store isn't configured; throws on HTTP or
// command error so callers can fail open.
async function redisCommand(cmd: (string | number)[]): Promise<unknown> {
  const creds = upstashCreds();
  if (!creds) return undefined;
  const res = await fetch(creds.url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(json.error);
  return json.result;
}

export function isCronClockEnabled(): boolean {
  return upstashCreds() !== null;
}

// Booleans only (no values) — surfaced in the /api/cron/tick response so a
// misconfigured env var can be spotted without reading secrets. Behind the
// CRON_SECRET like the rest of that route.
export function cronClockDiagnostics() {
  const creds = upstashCreds();
  return {
    enabled: creds !== null,
    hasRedisUrl: Boolean(creds?.url),
    hasRedisToken: Boolean(creds?.token),
    itemKey: itemKey(),
  };
}

// The stored nextDueAt (epoch-ms), or null when the gate can't confidently
// skip — not configured, key never written / expired, or any error. A null
// return always means "run the full tick".
export async function readNextDueAt(): Promise<number | null> {
  if (!isCronClockEnabled()) return null;
  try {
    const result = await redisCommand(["GET", itemKey()]);
    if (result == null) return null; // key missing / expired → run + write it
    const n = typeof result === "number" ? result : Number(result);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function writeNextDueAt(value: number): Promise<void> {
  if (!isCronClockEnabled()) return;
  try {
    await redisCommand(["SET", itemKey(), String(value), "EX", String(KEY_TTL_SECONDS)]);
  } catch {
    // Swallowed — the next real tick recomputes and rewrites. A persistently
    // failing write just degrades to "full tick every minute" (the pre-gate
    // behaviour).
  }
}

// "Work might be due right now" — pull the clock back to now so the next cron
// tick runs in full. Cheap (one write); worst case it costs one extra real
// tick. Fire-and-forget from the caller's point of view.
export async function bustCronClock(): Promise<void> {
  if (!isCronClockEnabled()) return;
  await writeNextDueAt(Date.now());
}

// The earliest instant the run engine + heartbeat tick next has real work:
// the min over every RUNNING workflow's FeedLink next-fire, pending in-flight
// arrival, workflow auto-stop deadline, due heartbeat, and BL-086
// auto-offline sweep. Nothing scheduled → now + IDLE_HORIZON_MS. Clamped to
// [now, now + IDLE_HORIZON_MS]. Runs only after a real tick (which already
// hit the DB), so it adds no extra Neon wake.
export async function computeNextDueAt(): Promise<number> {
  const now = Date.now();
  const cands: number[] = [];

  const links = await prisma.feedLink.findMany({
    where: { fireIntervalSeconds: { gt: 0 }, workflow: { status: "RUNNING" } },
    select: { fireIntervalSeconds: true, lastFiredAt: true },
  });
  for (const l of links) {
    cands.push(l.lastFiredAt ? l.lastFiredAt.getTime() + l.fireIntervalSeconds * 1000 : now);
  }

  const nextArrival = await prisma.inFlightBatch.findFirst({
    where: { processedAt: null },
    orderBy: { arrivesAt: "asc" },
    select: { arrivesAt: true },
  });
  if (nextArrival) cands.push(nextArrival.arrivesAt.getTime());

  const running = await prisma.workflow.findMany({
    where: { status: "RUNNING", runningStartedAt: { not: null }, maxRunDurationMinutes: { not: null } },
    select: { runningStartedAt: true, maxRunDurationMinutes: true },
  });
  for (const w of running) {
    cands.push(w.runningStartedAt!.getTime() + (w.maxRunDurationMinutes ?? 0) * 60_000);
  }

  const devices = await prisma.device.findMany({
    where: { heartbeatEnabled: true, publishedAt: { not: null }, collectorId: { not: null } },
    select: {
      lastHeartbeatSentAt: true,
      heartbeatTimeoutSeconds: true,
      autoOfflineAt: true,
      configured: true,
      publishedAt: true,
      offlineAt: true,
      tasks: { select: { workflow: { select: { status: true } } } },
    },
  });
  for (const d of devices) {
    if (d.autoOfflineAt && !d.offlineAt) cands.push(d.autoOfflineAt.getTime());
    if (getDeviceState(d) === "OFFLINE") continue;
    cands.push(
      d.lastHeartbeatSentAt ? d.lastHeartbeatSentAt.getTime() + d.heartbeatTimeoutSeconds * 1000 : now
    );
  }

  const min = cands.length > 0 ? Math.min(...cands) : now + IDLE_HORIZON_MS;
  return Math.min(Math.max(min, now), now + IDLE_HORIZON_MS);
}

export const CRON_CLOCK_SKEW_MS = SKEW_MS;
