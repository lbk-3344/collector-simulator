## Task: Real DataCollector heartbeats — `PUT /collectors/{collectorId}/heartbeat` — BL-072

Direct request from Luc, 2026-08-31: "when the heartbeat is enabled, send a specific heartbeat endpoint every half of the period (like is 120s, every 60s) using the datacollector API endpoint for the heartbeat." Full spec: `CLAUDE-CONCEPT.md` section 15.10 (also updates the stale "this app never sends heartbeats" notes in 7.5, 15.8's framing, and the top of section 15 — read those cross-references, they now point here). Backlog: `BACKLOG.md` BL-072. Visual note: `CHARTE-GRAPHIQUE.md`'s "Device config screen" section, the 2026-08-31 addition.

### Important framing before you start

- **This is a real, live call to the Bartender platform**, same trust level as `POST /collectors/register` (BL-053) and `POST /reads` (BL-063) — no manual "send now" step, no dry-run mode. It fires automatically, on schedule, for every qualifying Device.
- **Only for Devices actually registered on the real platform.** `publishedAt == null` means Bartender has never heard of this Device's `collectorId` — heartbeating it is meaningless and must be skipped. Combined with `heartbeatEnabled === true` (Bartender's own semantics: `false` means "always ONLINE," so there's nothing to send).
- **The heartbeat PUT endpoint (`/collectors/{collectorId}/heartbeat`, generic, in `datacollector-api-v3 (2) (2).yaml`) is a completely different, well-specified schema from the `heartbeatConfig` object inside `POST /collectors/register`'s payload** — the one Phase 0 (BL-053) couldn't determine the accepted shape for and left out of the register call entirely. Don't conflate the two or reopen that unresolved question — it's unrelated to this feature and stays as-is (still omitted from register).
- **A new, second external per-minute scheduler call is needed from Luc** — same mechanism as `workflow-tick` (an external service like cron-job.org hitting a `CRON_SECRET`-guarded route every minute, since Vercel Hobby cron can't tick that often). This is a manual step outside the repo; flag it clearly when you're done, don't assume it's already set up.
- **Credentials**: reuse `getServiceCredentials()` from `lib/bartenderLocations.ts` exactly as `runTick()` already does for the real-reads push — it has no per-Device-owner resolution (picks the first user with a fully configured Bartender connection), which is fine and consistent, not something to "fix" here.

### Phase 1 — Schema: heartbeat result tracking on `Device`

Add three columns to the `Device` model in `prisma/schema.prisma`, near the existing `heartbeatEnabled`/`heartbeatTimeoutSeconds` fields:

```prisma
lastHeartbeatSentAt DateTime? // stamped on every attempt, success or failure — drives the due-check
lastHeartbeatStatus String?   // "ONLINE" | "CONFIG_PENDING" | "FAILED", from the most recent attempt
lastHeartbeatError  String?   // message from the most recent FAILED attempt; cleared on the next success
```

`npx prisma migrate dev --name add_device_heartbeat_tracking`.

### Phase 2 — `sendHeartbeat` client

`lib/bartenderDataCollector.ts` — add alongside `registerCollector`/`deregisterCollector`/`sendReads`, reusing `resolveDataCollectorGatewayUrl` and the existing `errorMessageFrom` helper:

```typescript
export interface SendHeartbeatResult {
  ok: boolean;
  status: number;
  heartbeatStatus?: "ONLINE" | "CONFIG_PENDING";
  lastSeenAt?: string;
  errorMessage?: string;
}

// PUT {gateway}/collectors/{collectorId}/heartbeat (datacollector-api-v3,
// CLAUDE-CONCEPT.md 15.10). configVersion is optional on the wire — passing
// it lets Bartender detect drift and return CONFIG_PENDING; omit it (or
// pass null/undefined) to send a pure keepalive.
export async function sendHeartbeat(
  tenantUrl: string,
  apiKey: string,
  collectorId: string,
  configVersion?: string | null
): Promise<SendHeartbeatResult> {
  const url = `${resolveDataCollectorGatewayUrl(tenantUrl)}/collectors/${encodeURIComponent(collectorId)}/heartbeat`;
  const body: Record<string, unknown> = { timestamp: new Date().toISOString() };
  if (configVersion) body.configVersion = configVersion;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, errorMessage: "Could not reach the Bartender platform." };
  }

  const raw = await res.text().catch(() => "");
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep raw */
  }

  if (res.ok) {
    const b = parsed as { status?: "ONLINE" | "CONFIG_PENDING"; lastSeenAt?: string } | null;
    return { ok: true, status: res.status, heartbeatStatus: b?.status, lastSeenAt: b?.lastSeenAt };
  }
  return { ok: false, status: res.status, errorMessage: errorMessageFrom(parsed, raw, res.status) };
}
```

Update the file's own top-of-file comment ("heartbeat ... deliberately not modeled") — it's now wrong for this endpoint specifically (the `heartbeatConfig`-on-register issue is still accurate and unrelated, leave that part alone).

### Phase 3 — `runHeartbeatTick()` + cron route

New `lib/deviceHeartbeat.ts`, modeled on `lib/workflowRun.ts`'s `runTick()` shape (a single exported async function, called by a thin route):

```typescript
import { prisma } from "@/lib/prisma";
import { getServiceCredentials } from "@/lib/bartenderLocations";
import { sendHeartbeat } from "@/lib/bartenderDataCollector";

export interface HeartbeatTickSummary {
  checked: number;
  sent: number;
  online: number;
  configPending: number;
  failed: number;
  notes: string[];
}

export async function runHeartbeatTick(): Promise<HeartbeatTickSummary> {
  const now = new Date();
  const summary: HeartbeatTickSummary = { checked: 0, sent: 0, online: 0, configPending: 0, failed: 0, notes: [] };
  const creds = await getServiceCredentials();

  const devices = await prisma.device.findMany({
    where: { heartbeatEnabled: true, publishedAt: { not: null }, collectorId: { not: null } },
    select: { id: true, collectorId: true, configVersion: true, heartbeatTimeoutSeconds: true, lastHeartbeatSentAt: true },
  });

  for (const device of devices) {
    summary.checked++;
    const intervalMs = (device.heartbeatTimeoutSeconds / 2) * 1000;
    const due = !device.lastHeartbeatSentAt || now.getTime() - device.lastHeartbeatSentAt.getTime() >= intervalMs;
    if (!due || !device.collectorId) continue;

    // Optimistic claim, same pattern as FeedLink firing — a concurrent tick
    // can't double-send.
    const claim = await prisma.device.updateMany({
      where: { id: device.id, lastHeartbeatSentAt: device.lastHeartbeatSentAt },
      data: { lastHeartbeatSentAt: now },
    });
    if (claim.count === 0) continue;

    if (!creds) {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastHeartbeatStatus: "FAILED", lastHeartbeatError: "no Bartender connection configured" },
      });
      summary.failed++;
      continue;
    }

    const res = await sendHeartbeat(creds.tenantUrl, creds.apiKey, device.collectorId, device.configVersion);
    summary.sent++;
    if (res.ok) {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastHeartbeatStatus: res.heartbeatStatus ?? "ONLINE", lastHeartbeatError: null },
      });
      if (res.heartbeatStatus === "CONFIG_PENDING") summary.configPending++;
      else summary.online++;
    } else {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastHeartbeatStatus: "FAILED", lastHeartbeatError: res.errorMessage ?? "heartbeat failed" },
      });
      summary.failed++;
      summary.notes.push(`heartbeat ${device.collectorId}: ${res.errorMessage ?? "failed"}`);
    }
  }

  return summary;
}
```

New `app/api/cron/heartbeat-tick/route.ts` — copy `app/api/cron/workflow-tick/route.ts`'s structure verbatim (same `authorized()` check against `CRON_SECRET`, same `x-cron-secret`/`Authorization: Bearer` acceptance, same GET+POST, same try/catch-and-500 shape), swapping in `runHeartbeatTick()`:

```typescript
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runHeartbeatTick } from "@/lib/deviceHeartbeat";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret || bearer === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runHeartbeatTick();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[heartbeat-tick] failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
```

Reuses the same `CRON_SECRET` env var — no new secret needed, just a second scheduled call hitting this new URL.

### Phase 4 — Surface it in the Device config modal

`lib/deviceConfig.ts`'s `DeviceRecord` interface — add the three new fields next to the existing sync-health ones:

```typescript
lastHeartbeatSentAt: string | null;
lastHeartbeatStatus: string | null;
lastHeartbeatError: string | null;
```

`components/DeviceConfigModal.tsx` — near the existing `syncBanner` (`lastSyncError`) rendering, add a heartbeat-health line reading off the same `syncSource` (`postSave ?? device`) the sync banner already uses, so it reflects a just-saved Device the same way:

```tsx
{syncSource?.lastHeartbeatError && <div className="error-banner">Heartbeat failing: {syncSource.lastHeartbeatError}</div>}
{syncSource?.lastHeartbeatStatus && !syncSource.lastHeartbeatError && (
  <p className="note">
    Last heartbeat: {syncSource.lastHeartbeatStatus}
    {syncSource.lastHeartbeatSentAt && `, ${new Date(syncSource.lastHeartbeatSentAt).toLocaleString()}`}
  </p>
)}
```

Place it right after the existing sync-error banner block (same top-of-modal-body location, per `CHARTE-GRAPHIQUE.md`'s note). Nothing shown for a Device that's never had a heartbeat attempt (unpublished, or heartbeat disabled) — same "only show it once there's something to show" posture as the sync banner.

Also fix the now-stale comment at `components/DeviceConfigModal.tsx`'s `conflictOrBrokenMappings()` (~line 317): it currently reads "OFFLINE is expected (this app never sends heartbeats) and not surfaced." That assumption is what this feature changes. **Leave the actual filtering behavior alone** (still only surfacing `CONFLICT`/`BROKEN`, not `OFFLINE`, from `platformReconciliation` — that's a separate, still-undecided product question per 15.10, not something to change here) — just correct or remove the comment so it doesn't mislead the next person reading it.

### Verify

- **Due-check math**: a Device with `heartbeatTimeoutSeconds: 120` gets a heartbeat sent roughly every 60s of ticks (i.e., on every tick if the external scheduler runs every minute, since `lastHeartbeatSentAt` will always be ≥60s old by the next tick) — confirm with a couple of consecutive manual `curl`s against `/api/cron/heartbeat-tick` a minute apart, checking `lastHeartbeatSentAt` actually advances each time and doesn't fire on ticks that are too soon (test with a short local timeout like 10s if that's faster to verify against `20s`/`10s` due-cycles).
- **Skips correctly**: an unpublished Device (`publishedAt: null`), and a published Device with `heartbeatEnabled: false`, are both skipped — `checked` in the tick summary should still count them attempted-and-skipped or simply not select them (your call which, just make sure neither calls the real endpoint).
- **Success path**: against the sandbox tenant, a published Device's heartbeat returns `200` with `status: ONLINE`, `lastHeartbeatStatus` updates to `"ONLINE"`, `lastHeartbeatError` clears, and the modal shows the "Last heartbeat: ONLINE, …" line.
- **`CONFIG_PENDING` path**: change that Device's `configVersion` locally without re-publishing, send another heartbeat, confirm the response comes back `CONFIG_PENDING` and `lastHeartbeatStatus` reflects it (no auto-re-registration expected — that's explicitly out of scope here).
- **Failure path**: a bad/expired API key or unreachable tenant → `lastHeartbeatStatus: "FAILED"`, `lastHeartbeatError` set, modal shows the red banner — and confirm the local sim/other features are entirely unaffected by the failure (same "never blocks anything else" posture as every other real-platform call in this app).
- **CRON_SECRET auth**: `GET`/`POST /api/cron/heartbeat-tick` with no or wrong secret → `401`; with the right one (either header form) → runs and returns a summary.
- **Concurrent-tick safety**: fire two overlapping requests to the route in quick succession (or trust the same optimistic-claim pattern the run engine already relies on) — confirm a Device doesn't get double-heartbeated in one due window.

### Conventions (same as every previous batch)

- Work on `staging`. Commit message references BL-072. `npm version minor --no-git-tag-version` (new backlog item, no letter suffix).
- If any file name, field name, or existing helper above doesn't match what you find in the real code, that's fine — adjust to what's actually there.
- Check off BL-072 in `BACKLOG.md` with a short completion note, and **explicitly tell Luc in your summary that a second external per-minute scheduled call needs setting up** (cron-job.org or equivalent) pointed at `/api/cron/heartbeat-tick` with the same `CRON_SECRET` — this doesn't work automatically just because the code is deployed.
