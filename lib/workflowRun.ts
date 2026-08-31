import { prisma } from "@/lib/prisma";
import { getServiceCredentials } from "@/lib/bartenderLocations";
import { mintSerializedItems, SerializationError, MAX_NEW_ITEMS_PER_FIRING } from "@/lib/bartenderSerialization";
import { getStock } from "@/lib/bartenderInventory";
import { sendReads } from "@/lib/bartenderDataCollector";

type ServiceCreds = Awaited<ReturnType<typeof getServiceCredentials>>;

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
  // The batch's GTIN for Flow Link filtering — the sole GTIN when the batch
  // is single-GTIN, else null (a mixed-GTIN NEW batch can't be filtered by a
  // single value; revisit with per-item GTINs if needed).
  gtin: string | null;
  note?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function feedGtins(feed: any): string[] {
  return Array.isArray(feed.gtins) ? feed.gtins.map((g: unknown) => String(g).trim()).filter(Boolean) : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveBatch(feed: any, creds: ServiceCreds): Promise<ResolvedBatch> {
  if (feed.kind === "FIXED") {
    const items = Array.isArray(feed.fixedItems) ? (feed.fixedItems as string[]) : [];
    return { items, gtin: null };
  }

  const quantity = randInt(feed.quantityMin ?? 1, feed.quantityMax ?? feed.quantityMin ?? 1);
  const gtins = feedGtins(feed);

  if (feed.kind === "NEW") {
    if (!creds) return { items: [], gtin: null, note: "no Bartender connection configured for the run engine" };
    if (gtins.length === 0) return { items: [], gtin: null, note: "NEW feed has no GTIN" };
    try {
      // mintSerializedItems clamps the TOTAL to MAX_NEW_ITEMS_PER_FIRING and
      // splits it randomly across the feed's GTINs.
      const minted = await mintSerializedItems(creds.tenantUrl, creds.username, creds.password, gtins, quantity);
      const distinct = new Set(minted.map((m) => m.gtin));
      return { items: minted.map((m) => m.epc), gtin: distinct.size === 1 ? [...distinct][0] : null };
    } catch (e) {
      const msg = e instanceof SerializationError ? e.message : "serialization call failed";
      return { items: [], gtin: null, note: msg };
    }
  }

  // PRESENT — query real stock in the zone. The Inventory API returns
  // aggregate counts (no individual EPCs — 7.8), so pulled items are
  // placeholder ids (can't be pushed to the platform; local sim only).
  if (!creds) return { items: [], gtin: null, note: "no Bartender connection configured for the run engine" };
  const useAll = feed.presentMatchMode === "ALL";
  const stock = await getStock(creds.tenantUrl, creds.apiKey, {
    groupBy: "zone",
    locationCode: feed.locationCode ?? undefined,
    zoneCode: feed.zoneCode ?? undefined,
    pids: useAll ? undefined : gtins,
  });
  if (!stock.ok) return { items: [], gtin: null, note: stock.errorMessage };
  const available = stock.results.reduce((sum, r) => sum + (r.qty ?? 0), 0);
  const pull = Math.min(available, quantity);
  const items = Array.from({ length: pull }, (_, i) => `present:${feed.zoneCode ?? "zone"}:${Date.now()}:${i}`);
  return { items, gtin: !useAll && gtins.length === 1 ? gtins[0] : null };
}

interface ReadPushStats {
  pushed: number;
  notProcessed: number;
  failed: number;
}

// Write the read event for (taskId, channelId), push it to the real Track &
// Trace platform (POST /reads — every read, entry firing and every hop, per
// Luc 2026-08-31), then fan the batch out along this Task/Channel's outgoing
// Flow Links — a copy per matching edge, or the `else` edge for anything
// unmatched — scheduling each as an InFlightBatch.
async function emitReadAndScheduleHops(args: {
  workflowId: string;
  taskId: string;
  deviceId: string;
  collectorId: string | null;
  channelId: string;
  items: string[];
  gtin: string | null;
  at: Date;
  creds: ServiceCreds;
  push: ReadPushStats;
  notes: string[];
}) {
  const { workflowId, taskId, deviceId, collectorId, channelId, items, gtin, at, creds, push, notes } = args;

  await prisma.simulatedRead.create({
    data: { workflowId, taskId, deviceId, channelId, items, gtin, occurredAt: at },
  });

  // Real platform read. Skipped silently when there's nothing submittable
  // (e.g. PRESENT-feed placeholder ids — see 7.5/16.5) or no collectorId.
  if (creds && collectorId && items.length > 0) {
    const res = await sendReads(creds.tenantUrl, creds.apiKey, collectorId, channelId, items, at);
    if (res.ok) {
      if (res.readStatus === "NOTPROCESSED") {
        push.notProcessed++;
        notes.push(`reads ${collectorId}/${channelId}: NOTPROCESSED (channel has no active zone mapping)`);
      } else {
        push.pushed++;
      }
    } else if (res.status !== 0 || res.errorMessage?.includes("reach")) {
      push.failed++;
      notes.push(`reads ${collectorId}/${channelId}: ${res.errorMessage ?? "failed"}`);
    }
  }

  const links = await prisma.flowLink.findMany({ where: { sourceTaskId: taskId, sourceChannelId: channelId } });
  if (links.length === 0) return; // terminal point

  const nonElse = links.filter((l) => !l.isElse);
  const matched = nonElse.filter((l) => filterMatches(l, gtin));
  const elseLink = links.find((l) => l.isElse);
  const targets = matched.length > 0 ? matched : elseLink ? [elseLink] : [];

  for (const link of targets) {
    const delay = randInt(link.delayMinSeconds, link.delayMaxSeconds);
    await prisma.inFlightBatch.create({
      data: {
        workflowId: link.workflowId,
        taskId: link.targetTaskId,
        channelId: link.targetChannelId,
        items,
        gtin,
        arrivesAt: new Date(at.getTime() + delay * 1000),
      },
    });
  }
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
  const creds = await getServiceCredentials();

  // ── 1. Firing — one per due FeedLink (cadence lives on the FeedLink) ──
  const dueLinks = await prisma.feedLink.findMany({
    where: {
      fireIntervalSeconds: { gt: 0 },
      workflow: { status: "RUNNING" },
    },
    include: {
      feedNode: { include: { itemFeed: true } },
      targetTask: { select: { id: true, deviceId: true, workflowId: true, device: { select: { collectorId: true } } } },
    },
  });

  for (const link of dueLinks) {
    const intervalMs = (link.fireIntervalSeconds ?? 0) * 1000;
    const due = !link.lastFiredAt || now.getTime() - link.lastFiredAt.getTime() >= intervalMs;
    const feed = link.feedNode?.itemFeed;
    if (!due || !feed) continue;

    // Optimistic claim on lastFiredAt so a concurrent tick can't double-fire.
    const claim = await prisma.feedLink.updateMany({
      where: { id: link.id, lastFiredAt: link.lastFiredAt },
      data: { lastFiredAt: now },
    });
    if (claim.count === 0) continue;

    const batch = await resolveBatch(feed, creds);
    if (batch.note) summary.notes.push(`feed "${feed.name}": ${batch.note}`);
    if (feed.kind === "NEW") summary.itemsMinted += batch.items.length;
    summary.firedInputs++;

    await emitReadAndScheduleHops({
      workflowId: link.targetTask.workflowId,
      taskId: link.targetTask.id,
      deviceId: link.targetTask.deviceId,
      collectorId: link.targetTask.device?.collectorId ?? null,
      channelId: link.targetChannelId,
      items: batch.items,
      gtin: batch.gtin,
      at: now,
      creds,
      push,
      notes: summary.notes,
    });
  }

  // ── 2. Arrivals ──────────────────────────────────────────────────────
  const arrivals = await prisma.inFlightBatch.findMany({
    where: { processedAt: null, arrivesAt: { lte: now } },
    orderBy: { arrivesAt: "asc" },
    take: 500,
  });

  for (const b of arrivals) {
    // Claim it first — idempotent across overlapping ticks.
    const claim = await prisma.inFlightBatch.updateMany({
      where: { id: b.id, processedAt: null },
      data: { processedAt: now },
    });
    if (claim.count === 0) continue;

    const task = await prisma.task.findUnique({
      where: { id: b.taskId },
      select: {
        deviceId: true,
        workflowId: true,
        device: { select: { collectorId: true } },
        workflow: { select: { status: true } },
      },
    });
    if (!task || task.workflow.status !== "RUNNING") continue; // stopped mid-flight → batch just fizzles

    summary.arrivalsProcessed++;
    await emitReadAndScheduleHops({
      workflowId: task.workflowId,
      taskId: b.taskId,
      deviceId: task.deviceId,
      collectorId: task.device?.collectorId ?? null,
      channelId: b.channelId,
      items: (b.items as string[]) ?? [],
      gtin: b.gtin,
      at: now,
      creds,
      push,
      notes: summary.notes,
    });
  }

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
