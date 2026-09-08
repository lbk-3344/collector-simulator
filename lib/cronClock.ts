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
// moment the engine next has real work to do is kept in a Vercel **Global
// Config** item (`nextDueAt`, epoch-ms). Global Config (formerly "Edge
// Config" — Vercel renamed it; store ids still start with `ecfg_`) reads are
// edge-cached and never hit the database, so while nothing is due the
// compute gets no queries and autosuspends; when a workflow is actually
// running, `nextDueAt` is in the past every tick and the full tick runs.
//
// Writes go through the Vercel REST API (the store is read-only from the app
// runtime). `nextDueAt` is (re)written at the end of every real tick, and
// collapsed to "now" by bustCronClock() from the mutations that create
// imminent work (workflow start, a device coming online) so a just-started
// workflow is picked up within one tick.
//
// Fail-open everywhere: if the store isn't configured, or any read/write
// errors, the gate is inert and every tick runs in full — exactly the
// pre-gate behaviour. Three env vars must all be set for it to engage:
//   GLOBAL_CONFIG  — the read connection string Vercel injects when the
//                    store is linked to the project (older projects: EDGE_CONFIG)
//   VERCEL_API_TOKEN — a token with Global Config write access
//   VERCEL_TEAM_ID   — the team that owns the store (team_...)

const KEY = "nextDueAt";
// While nothing is scheduled, park the clock this far ahead. Bounds the
// worst-case "a mutation we don't bust on made work due" latency, and keeps
// one real (DB-touching) tick happening on that cadence as a safety re-sync.
// Must be comfortably over Neon's 5-min autosuspend so the compute still gets
// a real idle gap between those re-syncs.
const IDLE_HORIZON_MS = 30 * 60_000;
// Run the real tick slightly before the stored instant, never after.
const SKEW_MS = 2_000;

// The read connection string — Vercel names it GLOBAL_CONFIG now, EDGE_CONFIG
// on projects linked before the rename. Same URL shape either way:
// https://<host>/<ecfg_id>?token=<read-token>
function connString(): string | null {
  return process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG || null;
}

function configStoreId(): string | null {
  const conn = connString();
  if (!conn) return null;
  const m = conn.match(/(ecfg_[A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

export function isCronClockEnabled(): boolean {
  return Boolean(
    connString() && process.env.VERCEL_API_TOKEN && process.env.VERCEL_TEAM_ID && configStoreId()
  );
}

// Booleans only (no values) — surfaced in the /api/cron/tick response so a
// misconfigured env var can be spotted without reading secrets. Behind the
// CRON_SECRET like the rest of that route.
export function cronClockDiagnostics() {
  return {
    enabled: isCronClockEnabled(),
    hasConnString: Boolean(connString()),
    connStringVar: process.env.GLOBAL_CONFIG ? "GLOBAL_CONFIG" : process.env.EDGE_CONFIG ? "EDGE_CONFIG" : null,
    parsedStoreId: Boolean(configStoreId()),
    hasApiToken: Boolean(process.env.VERCEL_API_TOKEN),
    hasTeamId: Boolean(process.env.VERCEL_TEAM_ID),
  };
}

// The stored nextDueAt (epoch-ms), or null when the gate can't confidently
// skip — not configured, item never written, or any error. A null return
// always means "run the full tick".
export async function readNextDueAt(): Promise<number | null> {
  const conn = connString();
  if (!conn || !isCronClockEnabled()) return null;
  try {
    const [base, qs] = conn.split("?");
    const url = `${base.replace(/\/$/, "")}/item/${KEY}${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null; // 404 = item not written yet → run + write it
    const val = await res.json();
    return typeof val === "number" && Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

export async function writeNextDueAt(value: number): Promise<void> {
  if (!isCronClockEnabled()) return;
  const id = configStoreId();
  const team = process.env.VERCEL_TEAM_ID;
  const body = JSON.stringify({ items: [{ operation: "upsert", key: KEY, value }] });
  const headers = {
    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
    "content-type": "application/json",
  };
  try {
    // New path first (post-rename); fall back to the legacy one on 404.
    let res = await fetch(`https://api.vercel.com/v1/global-config/${id}/items?teamId=${team}`, {
      method: "PATCH",
      headers,
      body,
      cache: "no-store",
    });
    if (res.status === 404) {
      res = await fetch(`https://api.vercel.com/v1/edge-config/${id}/items?teamId=${team}`, {
        method: "PATCH",
        headers,
        body,
        cache: "no-store",
      });
    }
  } catch {
    // Swallowed — the next real tick recomputes and rewrites. A persistently
    // failing write just degrades to "full tick every minute" (today).
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
