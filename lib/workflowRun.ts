import { prisma } from "@/lib/prisma";
import { makeOwnerCredentialsCache, type RunCredentials } from "@/lib/bartenderLocations";
import { mintSerializedItems, SerializationError, MAX_NEW_ITEMS_PER_FIRING } from "@/lib/bartenderSerialization";
import { getStockHexa, getConfiguredInStockWindowDays } from "@/lib/bartenderInventory";
import { sendReads } from "@/lib/bartenderDataCollector";
import { mapWithConcurrency } from "@/lib/concurrency";

// Credentials for one firing — the *owning* user's Bartender connection, or
// null if they haven't configured one (2026-09-02, was a single global account).
type RunCreds = RunCredentials | null;

// Workflow run engine (BL-061, CLAUDE-CONCEPT.md 16.5). One `runTick()` does
// firing + arrivals + auto-stop; it's called by the CRON_SECRET-guarded
// route on an external every-minute schedule (Vercel Hobby cron can't tick
// that often — Phase 0 finding, see 16.5). No live token animation; each
// step just writes a SimulatedRead row (the plain activity log).

function randInt(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// See lib/concurrency.ts. Firings and arrivals are independent of each
// other — different tasks/channels, and every DB claim (lastFiredAt /
// processedAt) is a per-row atomic updateMany — so running a batch of them
// concurrently is safe. A workflow like "RTLS Stock" fires 30 FeedLinks in
// lockstep every 10 minutes; doing that sequentially serializes 30
// Bartender round-trips inside one maxDuration-capped invocation.
const TICK_CONCURRENCY = 6;

// Does a batch with this GTIN take this Flow Link? An edge with no filter
// takes everything; a GTIN filter is matched literally. Category filters
// aren't evaluated yet (would need a product→category lookup — flagged).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterMatches(link: any, gtin: string | null): boolean {
  const gtins = (link.filterGtins as string[] | null) ?? [];
  const cats = (link.filterCategoryCodes as string[] | null) ?? [];
  if (gtins.length === 0 && cats.length === 0) return true;
  if (gtin && gtins.includes(gtin)) return true;
  return false;
}

interface ResolvedBatch {
  items: string[];
  // Per-item GTIN, parallel to `items` — so a mixed-GTIN batch can be split
  // across outgoing Flow Links whose GTIN filters differ. `null` when the
  // item's GTIN isn't known (FIXED items).
  itemGtins: (string | null)[];
  note?: string;
}

function soleGtin(gtins: (string | null)[]): string | null {
  const distinct = new Set(gtins.filter((g): g is string => !!g));
  return distinct.size === 1 && gtins.every((g) => g) ? [...distinct][0] : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function feedGtins(feed: any): string[] {
  return Array.isArray(feed.gtins) ? feed.gtins.map((g: unknown) => String(g).trim()).filter(Boolean) : [];
}

// Exported for the manual-feed route (BL-078) — a one-off send from a Ready
// Device reuses the exact NEW-mint / PRESENT-stock-query / FIXED-list logic,
// nothing reinvented. The automated run engine is the only other caller.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveBatch(
  ownerId: string,
  feed: any,
  creds: RunCreds,
  inStockWindowDays: number | null
): Promise<ResolvedBatch> {
  if (feed.kind === "FIXED") {
    const items = Array.isArray(feed.fixedItems) ? (feed.fixedItems as string[]) : [];
    return { items, itemGtins: items.map(() => null) };
  }

  // NEW: a random count in the feed's min/max range. PRESENT ignores this —
  // it either takes the whole zone stock (presentTakeAll) or caps at
  // quantityMax (BL-070b).
  const quantity = randInt(feed.quantityMin ?? 1, feed.quantityMax ?? feed.quantityMin ?? 1);
  const gtins = feedGtins(feed);

  if (feed.kind === "NEW") {
    if (!creds) return { items: [], itemGtins: [], note: "the workflow owner has no Bartender connection configured" };
    if (gtins.length === 0) return { items: [], itemGtins: [], note: "NEW feed has no GTIN" };
    try {
      // mintSerializedItems clamps the TOTAL to MAX_NEW_ITEMS_PER_FIRING and
      // splits it randomly across the feed's GTINs.
      const minted = await mintSerializedItems(
        ownerId,
        creds.tenantUrl,
        creds.apiKey,
        gtins,
        quantity,
        feed.gs1Standard === "sgtin-198" ? "sgtin-198" : "sgtin-96"
      );
      return { items: minted.map((m) => m.epc), itemGtins: minted.map((m) => m.gtin) };
    } catch (e) {
      const msg = e instanceof SerializationError ? e.message : "serialization call failed";
      return { items: [], itemGtins: [], note: msg };
    }
  }

  // PRESENT — pull the REAL EPCs in the zone via POST /inventory/stock/analytics
  // (dimensions ["hexa","product.pid"], §7.8, live-verified 2026-09-02). Each
  // `hexa` is a genuine 24-char SGTIN-96, so unlike the pre-2026-09-02
  // placeholder ids these push for real through sendReads(). GTIN_LIST mode
  // narrows by product.pid; ALL mode takes whatever's present.
  if (!creds) return { items: [], itemGtins: [], note: "the workflow owner has no Bartender connection configured" };
  if (!feed.locationCode || !feed.zoneCode) {
    return { items: [], itemGtins: [], note: "PRESENT feed has no site + zone set" };
  }
  const useAll = feed.presentMatchMode === "ALL";
  const stock = await getStockHexa(ownerId, creds.tenantUrl, creds.apiKey, {
    locationCode: feed.locationCode,
    zoneCode: feed.zoneCode,
    pids: useAll ? undefined : gtins,
    inStockWindowDays,
  });
  if (!stock.ok) return { items: [], itemGtins: [], note: stock.errorMessage };
  if (stock.rows.length === 0) {
    return { items: [], itemGtins: [], note: "nothing in stock in that zone right now" };
  }
  // Default: push the entire current stock in the zone ("most of the time we
  // want the full stock" — Luc). `getStockHexa` returns up to 100 rows (the
  // analytics API's fixed page size, §7.8) — a firing over that ceiling is
  // rare here and not worth paging for. `presentTakeAll: false` caps the
  // firing at quantityMax, sampling a random subset so a presence reader
  // isn't always catching the same first N.
  const takeAll = feed.presentTakeAll !== false;
  const picked = takeAll
    ? stock.rows
    : [...stock.rows].sort(() => Math.random() - 0.5).slice(0, Math.max(1, feed.quantityMax ?? 1));
  return { items: picked.map((r) => r.hexa), itemGtins: picked.map((r) => r.pid ?? null) };
}

interface ReadPushStats {
  pushed: number;
  notProcessed: number;
  failed: number;
}

// The "push one read to the real platform" half of emitReadAndScheduleHops,
// pulled out so the manual-feed route (BL-078) shares one implementation
// instead of duplicating the sendReads call + status handling. A no-op that
// returns { pushed: false, notProcessed: false } when there's nothing
// submittable (no creds / no collectorId / empty batch) — same as before.
export async function pushReadToPlatform(args: {
  ownerId: string;
  creds: RunCreds;
  collectorId: string | null;
  channelId: string;
  items: string[];
  at: Date;
}): Promise<{ pushed: boolean; notProcessed: boolean; note?: string }> {
  const { ownerId, creds, collectorId, channelId, items, at } = args;
  if (!creds || !collectorId || items.length === 0) {
    return { pushed: false, notProcessed: false };
  }
  const res = await sendReads(ownerId, creds.tenantUrl, creds.apiKey, collectorId, channelId, items, at);
  if (res.ok) {
    if (res.readStatus === "NOTPROCESSED") {
      return {
        pushed: false,
        notProcessed: true,
        note: `reads ${collectorId}/${channelId}: NOTPROCESSED (channel has no active zone mapping)`,
      };
    }
    return { pushed: true, notProcessed: false };
  }
  if (res.status !== 0 || res.errorMessage?.includes("reach")) {
    return { pushed: false, notProcessed: false, note: `reads ${collectorId}/${channelId}: ${res.errorMessage ?? "failed"}` };
  }
  return { pushed: false, notProcessed: false };
}

// SimulatedRead had no retention at all — unlike ApiCallLog (capped 500/user
// with inline pruning), it just grew forever (5.5k+ rows in production after
// four days, only ever read as "last ~150" by the Activity views). Same
// inline-prune pattern as ApiCallLog: best-effort, fire-and-forget so it
// never adds latency to the hot path — losing an occasional prune cycle just
// means the table temporarily sits a little over the cap.
const MAX_SIMULATED_READS_PER_WORKFLOW = 500;

function pruneSimulatedReads(workflowId: string): void {
  prisma.simulatedRead
    .findMany({
      where: { workflowId },
      orderBy: { occurredAt: "desc" },
      skip: MAX_SIMULATED_READS_PER_WORKFLOW,
      select: { id: true },
    })
    .then((stale) =>
      stale.length ? prisma.simulatedRead.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } }) : null
    )
    .catch((e) => console.error("[workflowRun] failed to prune SimulatedRead", e));
}

// Write the read event for (taskId, channelId), push it to the real Track &
// Trace platform (POST /reads — every read, entry firing and every hop, per
// Luc 2026-08-31), then fan the batch out along this Task/Channel's outgoing
// Flow Links — a copy per matching edge, or the `else` edge for anything
// unmatched — scheduling each as an InFlightBatch.
async function emitReadAndScheduleHops(args: {
  ownerId: string;
  workflowId: string;
  taskId: string;
  deviceId: string;
  collectorId: string | null;
  channelId: string;
  items: string[];
  itemGtins: (string | null)[];
  at: Date;
  creds: RunCreds;
  push: ReadPushStats;
  notes: string[];
}) {
  const { ownerId, workflowId, taskId, deviceId, collectorId, channelId, items, itemGtins, at, creds, push, notes } = args;
  const gtin = soleGtin(itemGtins);

  await prisma.simulatedRead.create({
    data: { workflowId, taskId, deviceId, channelId, items, itemGtins, gtin, occurredAt: at },
  });
  pruneSimulatedReads(workflowId);

  // Real platform read — POST /reads with the real hexa/EPC tags (shared
  // helper, also used by the manual-feed route). PRESENT feeds now yield real
  // EPCs via stock/analytics (§7.8), so they push like NEW.
  const pushRes = await pushReadToPlatform({ ownerId, creds, collectorId, channelId, items, at });
  if (pushRes.pushed) {
    push.pushed++;
  } else if (pushRes.notProcessed) {
    push.notProcessed++;
    if (pushRes.note) notes.push(pushRes.note);
  } else if (pushRes.note) {
    push.failed++;
    notes.push(pushRes.note);
  }

  const links = await prisma.flowLink.findMany({ where: { sourceTaskId: taskId, sourceChannelId: channelId } });
  if (links.length === 0 || items.length === 0) return; // terminal / nothing to route

  const nonElse = links.filter((l) => !l.isElse);
  const elseLink = links.find((l) => l.isElse);

  // Route each item by its own GTIN — so a mixed-GTIN batch can split across
  // outgoing Flow Links whose filters differ (revised BL-061 Phase 4). An
  // item matched by no non-else link goes to the `else` link if there is one.
  const perLink = new Map<string, { items: string[]; gtins: (string | null)[] }>();
  for (let i = 0; i < items.length; i++) {
    const g = itemGtins[i] ?? null;
    const matches = nonElse.filter((l) => filterMatches(l, g));
    const targets = matches.length > 0 ? matches : elseLink ? [elseLink] : [];
    for (const t of targets) {
      const e = perLink.get(t.id) ?? { items: [], gtins: [] };
      e.items.push(items[i]);
      e.gtins.push(g);
      perLink.set(t.id, e);
    }
  }

  // Independent inserts (one per outgoing edge) — no ordering dependency.
  await Promise.all(
    [...perLink.entries()].map(([linkId, subset]) => {
      const link = links.find((l) => l.id === linkId)!;
      const delay = randInt(link.delayMinSeconds, link.delayMaxSeconds);
      return prisma.inFlightBatch.create({
        data: {
          workflowId: link.workflowId,
          taskId: link.targetTaskId,
          channelId: link.targetChannelId,
          items: subset.items,
          itemGtins: subset.gtins,
          gtin: soleGtin(subset.gtins),
          arrivesAt: new Date(at.getTime() + delay * 1000),
        },
      });
    })
  );
}

export interface TickSummary {
  firedInputs: number;
  itemsMinted: number;
  arrivalsProcessed: number;
  autoStopped: number;
  readsPushed: number;
  readsNotProcessed: number;
  readsFailed: number;
  notes: string[];
}

export async function runTick(): Promise<TickSummary> {
  const now = new Date();
  const push: ReadPushStats = { pushed: 0, notProcessed: 0, failed: 0 };
  const summary: TickSummary = {
    firedInputs: 0,
    itemsMinted: 0,
    arrivalsProcessed: 0,
    autoStopped: 0,
    readsPushed: 0,
    readsNotProcessed: 0,
    readsFailed: 0,
    notes: [],
  };
  // Per-owner Bartender credentials — each RUNNING Workflow belongs to a user
  // with their own tenant + API key; a firing's mint / stock / reads calls
  // must go there, not to one global account (2026-09-02 fix).
  const credsForOwner = makeOwnerCredentialsCache();

  // Per-tenant in-stock look-back window for PRESENT feeds — read off the
  // tenant config once per tick (keyed by API key). Caches the in-flight
  // Promise (not just the resolved value) for the same reason as
  // makeOwnerCredentialsCache above — concurrent PRESENT firings for the
  // same tenant (BL-081) must share one lookup, not each fire their own.
  const windowByKey = new Map<string, Promise<number | null>>();
  function windowForOwner(ownerId: string, c: RunCreds): Promise<number | null> {
    if (!c) return Promise.resolve(null);
    let pending = windowByKey.get(c.apiKey);
    if (!pending) {
      pending = getConfiguredInStockWindowDays(ownerId, c.tenantUrl, c.apiKey);
      windowByKey.set(c.apiKey, pending);
    }
    return pending;
  }

  // ── 1. Firing — one per due FeedLink (cadence lives on the FeedLink) ──
  const dueLinks = await prisma.feedLink.findMany({
    where: {
      fireIntervalSeconds: { gt: 0 },
      workflow: { status: "RUNNING" },
    },
    include: {
      feedNode: { include: { itemFeed: true } },
      workflow: { select: { ownerId: true } },
      targetTask: { select: { id: true, deviceId: true, workflowId: true, device: { select: { collectorId: true } } } },
    },
  });

  // BL-081 (2026-09-04 performance review): due links are independent of
  // each other — different tasks/channels, and the lastFiredAt claim below
  // is a per-row atomic updateMany — so a batch fires concurrently instead
  // of one at a time. A workflow like "RTLS Stock" (30 FeedLinks, all firing
  // in lockstep every 10 minutes) used to serialize 30 Bartender round-trips
  // inside one tick; this cuts that to TICK_CONCURRENCY in flight at once.
  await mapWithConcurrency(dueLinks, TICK_CONCURRENCY, async (link) => {
    const intervalMs = (link.fireIntervalSeconds ?? 0) * 1000;
    const due = !link.lastFiredAt || now.getTime() - link.lastFiredAt.getTime() >= intervalMs;
    const feed = link.feedNode?.itemFeed;
    if (!due || !feed) return;

    // Optimistic claim on lastFiredAt so a concurrent tick can't double-fire.
    const claim = await prisma.feedLink.updateMany({
      where: { id: link.id, lastFiredAt: link.lastFiredAt },
      data: { lastFiredAt: now },
    });
    if (claim.count === 0) return;

    const creds = await credsForOwner(link.workflow.ownerId);
    const window = feed.kind === "PRESENT" ? await windowForOwner(link.workflow.ownerId, creds) : null;
    const batch = await resolveBatch(link.workflow.ownerId, feed, creds, window);
    if (batch.note) summary.notes.push(`feed "${feed.name}": ${batch.note}`);
    if (feed.kind === "NEW") summary.itemsMinted += batch.items.length;
    summary.firedInputs++;

    await emitReadAndScheduleHops({
      ownerId: link.workflow.ownerId,
      workflowId: link.targetTask.workflowId,
      taskId: link.targetTask.id,
      deviceId: link.targetTask.deviceId,
      collectorId: link.targetTask.device?.collectorId ?? null,
      channelId: link.targetChannelId,
      items: batch.items,
      itemGtins: batch.itemGtins,
      at: now,
      creds,
      push,
      notes: summary.notes,
    });
  });

  // ── 2. Arrivals ──────────────────────────────────────────────────────
  const arrivals = await prisma.inFlightBatch.findMany({
    where: { processedAt: null, arrivesAt: { lte: now } },
    orderBy: { arrivesAt: "asc" },
    take: 500,
  });

  await mapWithConcurrency(arrivals, TICK_CONCURRENCY, async (b) => {
    // Claim it first — idempotent across overlapping ticks.
    const claim = await prisma.inFlightBatch.updateMany({
      where: { id: b.id, processedAt: null },
      data: { processedAt: now },
    });
    if (claim.count === 0) return;

    try {
      const task = await prisma.task.findUnique({
        where: { id: b.taskId },
        select: {
          deviceId: true,
          workflowId: true,
          device: { select: { collectorId: true } },
          workflow: { select: { status: true, ownerId: true } },
        },
      });
      if (!task || task.workflow.status !== "RUNNING") return; // stopped mid-flight → batch just fizzles

      summary.arrivalsProcessed++;
      await emitReadAndScheduleHops({
        ownerId: task.workflow.ownerId,
        workflowId: task.workflowId,
        taskId: b.taskId,
        deviceId: task.deviceId,
        collectorId: task.device?.collectorId ?? null,
        channelId: b.channelId,
        items: (b.items as string[]) ?? [],
        itemGtins: (b.itemGtins as (string | null)[] | null) ?? [],
        at: now,
        creds: await credsForOwner(task.workflow.ownerId),
        push,
        notes: summary.notes,
      });
    } finally {
      // Once claimed, this row has served its whole purpose either way (used
      // or fizzled) — delete it rather than leaving a permanently
      // "processed" row behind (BL-081: InFlightBatch had no retention at
      // all, 2.1k+ rows in production, 100% already-processed dead weight).
      await prisma.inFlightBatch.delete({ where: { id: b.id } }).catch(() => {});
    }
  });

  // ── 3. Auto-stop ─────────────────────────────────────────────────────
  const running = await prisma.workflow.findMany({
    where: { status: "RUNNING", runningStartedAt: { not: null }, maxRunDurationMinutes: { not: null } },
    select: { id: true, runningStartedAt: true, maxRunDurationMinutes: true },
  });
  for (const wf of running) {
    const elapsedMin = (now.getTime() - wf.runningStartedAt!.getTime()) / 60000;
    if (elapsedMin > (wf.maxRunDurationMinutes ?? Infinity)) {
      await prisma.workflow.update({
        where: { id: wf.id },
        // Leave runningStartedAt intact so the UI can say "auto-stopped after
        // running since <time>".
        data: { status: "STOPPED", autoStoppedAt: now },
      });
      summary.autoStopped++;
    }
  }

  summary.readsPushed = push.pushed;
  summary.readsNotProcessed = push.notProcessed;
  summary.readsFailed = push.failed;

  if (summary.itemsMinted > 0 && summary.itemsMinted % MAX_NEW_ITEMS_PER_FIRING === 0) {
    // cheap sanity breadcrumb in the response
    summary.notes.push(`minted ${summary.itemsMinted} new items this tick`);
  }
  return summary;
}
