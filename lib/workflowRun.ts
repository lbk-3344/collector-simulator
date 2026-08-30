import { prisma } from "@/lib/prisma";
import { getServiceCredentials } from "@/lib/bartenderLocations";
import { mintSerializedItems, SerializationError, MAX_NEW_ITEMS_PER_FIRING } from "@/lib/bartenderSerialization";
import { getStock } from "@/lib/bartenderInventory";

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
  gtin: string | null;
  note?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveBatch(feed: any, creds: Awaited<ReturnType<typeof getServiceCredentials>>): Promise<ResolvedBatch> {
  if (feed.kind === "FIXED") {
    const items = Array.isArray(feed.fixedItems) ? (feed.fixedItems as string[]) : [];
    return { items, gtin: feed.gtin ?? null };
  }

  const quantity = randInt(feed.quantityMin ?? 1, feed.quantityMax ?? feed.quantityMin ?? 1);

  if (feed.kind === "NEW") {
    if (!creds) return { items: [], gtin: feed.gtin ?? null, note: "no Bartender connection configured for the run engine" };
    if (!feed.gtin) return { items: [], gtin: null, note: "NEW feed has no GTIN" };
    try {
      // mintSerializedItems clamps to MAX_NEW_ITEMS_PER_FIRING internally.
      const items = await mintSerializedItems(creds.tenantUrl, creds.username, creds.password, feed.gtin, quantity);
      return { items, gtin: feed.gtin };
    } catch (e) {
      const msg = e instanceof SerializationError ? e.message : "serialization call failed";
      return { items: [], gtin: feed.gtin, note: msg };
    }
  }

  // PRESENT — query real stock in the zone; the Inventory API only returns
  // aggregate counts (no individual EPCs), so pulled items are placeholder
  // identifiers keyed to the GTIN. Flagged: real EPC enumeration needs a
  // different endpoint.
  if (!creds) return { items: [], gtin: feed.gtin ?? null, note: "no Bartender connection configured for the run engine" };
  const stock = await getStock(creds.tenantUrl, creds.apiKey, {
    groupBy: "zone",
    locationCode: feed.locationCode ?? undefined,
    zoneCode: feed.zoneCode ?? undefined,
    pid: feed.gtin ?? undefined,
  });
  if (!stock.ok) return { items: [], gtin: feed.gtin ?? null, note: stock.errorMessage };
  const available = stock.results.reduce((sum, r) => sum + (r.qty ?? 0), 0);
  const pull = Math.min(available, quantity);
  const items = Array.from({ length: pull }, (_, i) => `present:${feed.gtin ?? feed.zoneCode}:${Date.now()}:${i}`);
  return { items, gtin: feed.gtin ?? null };
}

// Write the read event for (taskId, channelId), then fan the batch out along
// this Task/Channel's outgoing Flow Links — a copy per matching edge, or the
// `else` edge for anything unmatched — scheduling each as an InFlightBatch.
async function emitReadAndScheduleHops(args: {
  workflowId: string;
  taskId: string;
  deviceId: string;
  channelId: string;
  items: string[];
  gtin: string | null;
  at: Date;
}) {
  const { workflowId, taskId, deviceId, channelId, items, gtin, at } = args;

  await prisma.simulatedRead.create({
    data: { workflowId, taskId, deviceId, channelId, items, gtin, occurredAt: at },
  });

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
  notes: string[];
}

export async function runTick(): Promise<TickSummary> {
  const now = new Date();
  const summary: TickSummary = { firedInputs: 0, itemsMinted: 0, arrivalsProcessed: 0, autoStopped: 0, notes: [] };
  const creds = await getServiceCredentials();

  // ── 1. Firing ────────────────────────────────────────────────────────
  const dueInputs = await prisma.taskChannelInput.findMany({
    where: {
      inputType: "ITEM_FEED",
      itemFeedId: { not: null },
      fireIntervalSeconds: { gt: 0 },
      task: { workflow: { status: "RUNNING" } },
    },
    include: { itemFeed: true, task: { select: { id: true, deviceId: true, workflowId: true } } },
  });

  for (const input of dueInputs) {
    const intervalMs = (input.fireIntervalSeconds ?? 0) * 1000;
    const due = !input.lastFiredAt || now.getTime() - input.lastFiredAt.getTime() >= intervalMs;
    if (!due || !input.itemFeed) continue;

    // Optimistic claim on lastFiredAt so a concurrent tick can't double-fire.
    const claim = await prisma.taskChannelInput.updateMany({
      where: { id: input.id, lastFiredAt: input.lastFiredAt },
      data: { lastFiredAt: now },
    });
    if (claim.count === 0) continue;

    const batch = await resolveBatch(input.itemFeed, creds);
    if (batch.note) summary.notes.push(`feed "${input.itemFeed.name}": ${batch.note}`);
    if (input.itemFeed.kind === "NEW") summary.itemsMinted += batch.items.length;
    summary.firedInputs++;

    await emitReadAndScheduleHops({
      workflowId: input.task.workflowId,
      taskId: input.task.id,
      deviceId: input.task.deviceId,
      channelId: input.channelId,
      items: batch.items,
      gtin: batch.gtin,
      at: now,
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
      select: { deviceId: true, workflowId: true, workflow: { select: { status: true } } },
    });
    if (!task || task.workflow.status !== "RUNNING") continue; // stopped mid-flight → batch just fizzles

    summary.arrivalsProcessed++;
    await emitReadAndScheduleHops({
      workflowId: task.workflowId,
      taskId: b.taskId,
      deviceId: task.deviceId,
      channelId: b.channelId,
      items: (b.items as string[]) ?? [],
      gtin: b.gtin,
      at: now,
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

  if (summary.itemsMinted > 0 && summary.itemsMinted % MAX_NEW_ITEMS_PER_FIRING === 0) {
    // cheap sanity breadcrumb in the response
    summary.notes.push(`minted ${summary.itemsMinted} new items this tick`);
  }
  return summary;
}
