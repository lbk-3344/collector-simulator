## Task: Workflow canvas editor + run/automation engine — BL-060, BL-061

**Supersedes the version of this prompt delivered earlier 2026-08-30** — Luc revised the design the same day, before this batch started: Item Feeds now get their own canvas node (big icon, navy background, white text), connected to Task Channels via a new **Feed Link** edge type (not a field picked inside the Channel row), the canvas must support defining a brand-new Item Feed inline, and the same Item Feed can be placed as multiple separate node instances. If you started from the earlier version of this prompt, stop and re-read from here — Phase 1 is split into three phases below (Task nodes, Feed nodes/Feed Links, Flow Links) and Phase 3 (now Phase 4)'s firing logic changed.

Full spec: `CLAUDE-CONCEPT.md` section 16.1/16.2/16.3/16.4 (canvas UI, revised), 16.5 (run & automation engine, revised), section 13's two 2026-08-30 decision-log entries (initial design, then the same-day revision). Backlog: `BACKLOG.md` BL-060/BL-061. Mockups delivered by Cowork: `item-feeds-and-flow-links.html` (entity concepts, predates the Feed Node revision), `workflow-canvas-editor.html` (interactive HTML demo of the edge-click-to-configure interaction — also predates the Feed Node revision; it shows a Feed as inline text on a Task's channel row rather than its own node, which is now wrong — the written spec below is the source of truth, an updated mockup may follow from Cowork but isn't required to proceed).

**This is Part 2 of 2 — depends on Part 1 (`claude-code-prompt-BL055-059-item-feeds-and-tasks.md`, the revised version) being merged first.** It needs `ItemFeed` (with `gtins`/`presentMatchMode`), `Task`, `FeedNode`, `FeedLink`, `FlowLink`, and the extended `Workflow` model (with `maxRunDurationMinutes`/`runningStartedAt`/`autoStoppedAt`) to already exist, plus their CRUD API routes. Don't start this batch until Part 1 is on `staging`. There is **no** `TaskChannelInput` model in the revised Part 1 — don't expect one.

### Important framing before you start

- **The canvas is the real authoring surface for Workflows** — dragging Devices in as Tasks, dragging Item Feeds in as Feed Nodes, wiring Feed Links and Flow Links, configuring each. There is no separate form-based Workflow builder to fall back to; this replaces the "no dedicated authoring UI yet" note from BL-042/section 15.2.
- **A Channel can be fed by more than one thing at once** — any number of Feed Links and Flow Links can target the same Task Channel simultaneously (Luc: "multiple feeds as input of a device"). Don't build any UI/validation that treats a Channel's input as a single exclusive choice.
- **Feed Nodes are visually distinct from Task nodes**: big icon, solid navy (`--accent-primary`) background, white text/icon — Task nodes keep the existing white-card treatment. See `CHARTE-GRAPHIQUE.md` "Workflow canvas — Feed Node visual style."
- **The same Item Feed can be placed multiple times** — dragging an already-existing Feed from the palette onto the canvas again creates a second, independent `FeedNode` referencing the same `ItemFeed`, at a new position. This is expected and useful, not a duplicate to warn about.
- **Automation must survive nobody being logged in.** This is the one requirement in this batch that isn't just UI — a Workflow that's `RUNNING` keeps firing on a server-side schedule regardless of whether anyone has the app open. Get Phase 0 right before writing any of the run-engine code; building the firing logic against an assumption about Cron frequency that turns out wrong means reworking the whole trigger mechanism.
- **The 10-item `NEW` cap from Part 1's `lib/bartenderSerialization.ts` fires automatically here, unattended, on a timer — there is deliberately no manual "generate now" step.** Don't add one; Luc was explicit the cap itself is the safety net, not a human-in-the-loop gate.
- No live token animation on the canvas is requested for this batch (Luc's explicit call, 2026-08-30) — build the plain run/activity log described in Phase 6 instead. Don't over-invest in canvas visual polish beyond what's needed to configure the graph clearly.

### Phase 0 — Mandatory live check before building the scheduler (blocking)

Vercel Cron's minimum firing frequency differs by plan. A Feed Link's `fireIntervalSeconds` (as low as tens of seconds, per the design) needs the scheduler to actually tick at least every minute or so — a plan that only allows daily cron invocations makes the whole "keeps running unattended" requirement unworkable as designed.

1. Check what Luc's actual Vercel plan/team allows for Cron job frequency (Vercel's dashboard/docs for the "ChefMate" team this project is hosted under — see `BACKLOG.md` BL-005).
2. **If a sub-hourly (ideally every-minute) cron schedule is available**: proceed with native Vercel Cron as designed (Phase 4 below).
3. **If it isn't** (e.g. limited to once/day on the current plan): don't silently build something that can't meet the spec. Fall back to an external free scheduler (e.g. cron-job.org, or any other reliable free tier) configured to hit this app's protected tick route every minute using a shared-secret header — functionally identical to Vercel Cron from the app's own code's point of view, just triggered externally. Either way, record which mechanism ended up used, and why, as a dated note in `CLAUDE-CONCEPT.md` section 16.5.

Don't guess past this — if the plan situation is genuinely unclear, ask Luc rather than assuming either outcome.

### Phase 1 — Canvas shell, Device palette, Task nodes

Install `@xyflow/react` (React Flow, MIT-licensed).

- A Workflow detail/edit page (`/workflows/[id]`, or wherever fits the existing nav — `app/(app)/workflows/` currently has no dedicated authoring UI, per BL-042's note) hosting the canvas full-height, toolbar on top: Workflow name (editable inline), a Run/Stop toggle (writes `Workflow.status`, and on flipping to `RUNNING` sets `runningStartedAt = now()` and clears `autoStoppedAt`; on flipping to `STOPPED` — by a user, not the auto-stop job — clears `runningStartedAt`), Save.
- Left palette, **two sections**: "Your devices" (this phase) and "Item Feeds" (Phase 2). **Your devices** lists the tenant's configured Devices not already attached to a Task in *this* Workflow (a Device can belong to at most one Task at a time, per Part 1's `Task.deviceId @unique` — if a Device already has a Task elsewhere, don't offer it, or offer it with a clear "already in use in <Workflow name>" state, your call on which reads better).
- Dragging a palette Device onto the canvas creates a `Task` (`POST /api/tasks`) at the drop position, rendered as a custom React Flow node: header (Device name/type icon/collector id), then one row per Channel from the Device's own `channels` Json array — each row is a named handle (`channelId`, e.g. `CH1`). A Channel can expose handles on **both** sides simultaneously (it can be a Feed/Flow Link target on the left and a Flow Link source on the right at the same time) — don't force a single left-or-right commitment the way an earlier draft of this spec assumed; render an inbound handle whenever the Channel has (or could have) incoming Feed/Flow Links, and an outbound handle whenever it has (or could have) outgoing Flow Links. A freshly-added Channel with no connections yet should still expose both, since either could be added first.
- Persist node position on drag-end (`PATCH /api/tasks/[id]` with `positionX`/`positionY`).

### Phase 2 — Item Feed palette, Feed Nodes, Feed Links

- **Item Feeds** palette section: lists existing Item Feeds (from Part 1's library) plus a **"+ New Feed"** entry. Dragging an existing Feed onto the canvas creates a new `FeedNode` (`POST /api/feed-nodes`) at the drop position — referencing that `ItemFeed`, independent of any other `FeedNode` that might already reference it elsewhere. Dragging **"+ New Feed"** onto the canvas opens Part 1's kind-specific `ItemFeedForm` inline (modal or side panel over the canvas, not a page navigation) — on save, creates the `ItemFeed` *and* a `FeedNode` placing it at the drop position, in one flow.
- Feed Node rendering: **big icon, solid navy background, white text** (`CHARTE-GRAPHIQUE.md` "Workflow canvas — Feed Node visual style") — a kind badge (`NEW`/`PRESENT`/`FIXED`) and the Feed's name, one output handle (a Feed Node has no inputs). Clicking a Feed Node (not dragging) opens the same `ItemFeedForm` for editing — editing here edits the shared `ItemFeed` definition, which affects every other `FeedNode` placing the same Feed; make that clearly visible in the edit UI (e.g. "used in N other places on this canvas" / across other Workflows) so it doesn't read as a per-placement edit by mistake.
- Dragging from a Feed Node's output handle to a Task Channel's inbound handle creates a `FeedLink` (`POST /api/feed-links`) with a default `fireIntervalSeconds` (pick a sane default, e.g. 60, and make it immediately editable). Any number of Feed Links can target the same Channel — including two Feed Links from the *same* Feed Node, or from two different Feed Nodes referencing the same or different Item Feeds. Don't add a uniqueness constraint here.
- Custom edge component for a Feed Link: a clickable label chip showing the firing interval. Clicking opens an inline panel with a single interval field (seconds).
- Persist Feed Node position on drag-end (`PATCH /api/feed-nodes/[id]`).
- Deleting a Feed Node cascades to its own `FeedLink`s (Prisma `onDelete: Cascade` handles the DB side — make sure the UI actually calls delete). Deleting an `ItemFeed` from its library page (Part 1) cascades to all its `FeedNode`s across every Workflow that placed it — Part 1's delete-usage-count warning should reflect that real blast radius.

### Phase 3 — Flow Links: drag-to-connect, click-to-configure

- Dragging from a Task's output Channel handle to another Task's input Channel handle calls `POST /api/flow-links` creating a `FlowLink` with default `delayMinSeconds`/`delayMaxSeconds: 0` and no filter.
- Custom edge component: a clickable label chip (matching `workflow-canvas-editor.html`'s interaction) showing the delay range (and filter summary, or "else" if `isElse`). Clicking opens an inline panel: delay min/max number inputs, a GTIN/category filter (reuse Part 1's product picker, multi-select), and an "else / catch-all" toggle.
- **Enforce at most one `isElse: true` edge per `(sourceTaskId, sourceChannelId)`** — app-level validation on save (this isn't a DB constraint in Part 1's schema), clear error if the user tries to mark a second one.
- No fan-in limit on a target Channel (confirmed by Luc — "not limited, many upstream task to this one") — don't add validation that blocks multiple Flow Links (or a mix of Flow Links and Feed Links) into the same target.
- Deleting a Task cascades to its own incoming `FeedLink`s and any `FlowLink`s touching it (Prisma `onDelete: Cascade` handles the DB side — make sure the UI actually calls delete rather than just hiding the node).

### Phase 4 — Run & automation engine (BL-061, revised 2026-08-30)

New models, add to `prisma/schema.prisma`:

```prisma
model InFlightBatch {
  id          String    @id @default(cuid())
  workflowId  String
  workflow    Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  taskId      String
  channelId   String
  items       Json      // string[] — EPC hex or URN
  gtin        String?
  arrivesAt   DateTime  // when this batch should be "read" at (taskId, channelId)
  processedAt DateTime? // set once a tick has generated the read event and evaluated outgoing Flow Links

  createdAt DateTime @default(now())
}

model SimulatedRead {
  id         String   @id @default(cuid())
  workflowId String
  taskId     String
  deviceId   String
  channelId  String
  items      Json     // string[]
  gtin       String?
  occurredAt DateTime @default(now())
}
```

Also add a `lastFiredAt DateTime?` field to `FeedLink` (Part 1's model) — tracks when this specific edge last fired, since cadence now lives per-edge rather than per-Channel.

Migrate: `npx prisma migrate dev --name add_workflow_run_engine`.

New protected route, e.g. `app/api/cron/workflow-tick/route.ts`, guarded by a shared-secret header (`CRON_SECRET` env var, standard Vercel Cron pattern — reject any request missing/mismatching it). On each tick:

1. **Firing**: for every `FeedLink` whose `targetTask.workflow.status === "RUNNING"`, check whether it's due (`lastFiredAt` is null, or `now - lastFiredAt >= fireIntervalSeconds`). If due: resolve the batch via the Feed Link's `FeedNode.itemFeed`'s kind — `NEW` → Part 1's `mintSerializedItems` (across the Feed's full `gtins` list, capped at 10 total); `PRESENT` → Part 1's `getStock` against the Feed's zone, with a `pids` filter built from `gtins` when `presentMatchMode` is `GTIN_LIST`, or no `pids` filter at all when it's `ALL`, pulling up to the configured quantity from what's actually there, zero if none; `FIXED` → the stored explicit list, every time. Set `lastFiredAt = now` on the `FeedLink`. Write a `SimulatedRead` immediately at the Feed Link's target `(taskId, channelId)`, and an `InFlightBatch` per **outgoing** `FlowLink` from that Task/Channel whose filter matches this batch's GTIN(s) (or the `isElse` edge, for anything unmatched) — `arrivesAt = now + random(delayMinSeconds, delayMaxSeconds)`. A batch spanning multiple GTINs (a multi-GTIN `NEW`/`PRESENT` Feed) may need to split across multiple outgoing Flow Links if their filters differ by GTIN — evaluate per-item, not per-batch, when a Task's outgoing edges have GTIN filters that would otherwise split a mixed-GTIN batch.
2. **Arrivals**: for every unprocessed `InFlightBatch` with `arrivesAt <= now`, write a `SimulatedRead` at its `(taskId, channelId)`, then repeat step 1's "evaluate outgoing Flow Links" logic from *that* Task/Channel to schedule the next hop(s) — recursively, until a batch reaches a Task/Channel with no outgoing Flow Links (a terminal point — its journey just ends). Mark the `InFlightBatch` `processedAt = now`.
3. **Auto-stop**: for every `Workflow` with `status: "RUNNING"` and a non-null `runningStartedAt`, if `now - runningStartedAt > maxRunDurationMinutes`, set `status: "STOPPED"`, `autoStoppedAt: now`, and leave `runningStartedAt` as-is (so the UI can show "auto-stopped after running since <time>", not just "stopped").

Keep the tick idempotent and safe to run concurrently/overlapping (a slow tick shouldn't double-fire if Cron invokes again before the previous run finishes) — a simple approach is fine here (e.g. a short-lived advisory lock row, or accepting that a rare double-fire just means one extra `NEW` batch under the existing 10-cap is not a serious problem) — don't over-engineer this, just don't leave it completely unguarded either.

`vercel.json` (or the Vercel dashboard, if that's the current project's convention) needs the Cron schedule wired to this route, at whatever frequency Phase 0 confirmed is available; if the external-scheduler fallback applies instead, document the exact URL+secret setup Luc needs to configure on that external service's side.

### Phase 5 — Auto-stop default duration

Part 1 shipped `Workflow.maxRunDurationMinutes` with a placeholder default (240 minutes / 4 hours). Surface it as an editable field in this batch's canvas toolbar (or a small Workflow settings panel) rather than leaving it buried — and flag to Luc directly once this is visible and testable that the default is a placeholder he should confirm or change, per `CLAUDE-CONCEPT.md` 16.8.

### Phase 6 — Minimal run/activity visibility

No animation (per Luc, 2026-08-30) — but some visibility that automation is actually happening is worth having for both Luc and future debugging. A simple `SimulatedRead` log view is enough: a table/list (own tab on the Workflow page, or a slide-over panel) showing recent reads for this Workflow — time, Task name, Channel, item count, GTIN if known — newest first, auto-refreshing or manually refreshable, your call on which fits the existing patterns in this app better (e.g. the Devices list's plain table vs. something more live). Don't build more than this without Luc asking for it.

### Verify

- Phase 0's Cron-frequency finding is recorded in `CLAUDE-CONCEPT.md` before Phase 4 is built against it.
- Full drag-and-drop round trip: drag a Device in (Task), drag an existing Item Feed in (Feed Node), drag "+ New Feed" in and create one inline (second Feed Node), connect both Feed Nodes to the **same** Task Channel (Feed Link fan-in), drag a Flow Link from that Task to a second Task, click both edge types and configure them, mark a second outgoing Flow Link as `else`, save, reload the page — everything persists and re-renders correctly, including the double-Feed-Link fan-in.
- Confirm the same `ItemFeed` placed as two separate `FeedNode`s on the canvas renders as two independent boxes, and editing the Feed's definition from either one is reflected on both.
- Start a Workflow (`Run`), wait past at least one Feed Link's `fireIntervalSeconds`, confirm a `SimulatedRead` was actually created (via Phase 6's log or a direct DB check) without anyone having the page open in a browser tab in the meantime — this is the actual test of the "runs unattended" requirement, not just that the UI button works.
- Confirm the 10-item `NEW` cap holds even under automated firing (not just the one-off call tested in Part 1) — set a `NEW` Item Feed's `quantityMax` above 10, let it fire automatically, confirm the resulting `SimulatedRead`/`InFlightBatch` items array is capped at 10 total across however many GTINs it lists.
- Confirm a Workflow left `RUNNING` past its `maxRunDurationMinutes` actually flips to `STOPPED` with `autoStoppedAt` set, without a user action.
- `npm run build` passes; `npx prisma migrate dev` runs cleanly.

### Conventions (same as every previous batch)

- Work on `staging`. `npm version minor --no-git-tag-version` (new features, no letter suffix).
- Record every live finding (Cron plan limits, any auth/response-shape surprise from Part 1's clients surfacing here under real automated load) as dated `CLAUDE-CONCEPT.md` additions.
- If the "which Task gets to assign a Workflow" UX fork flagged at the end of Part 1's prompt wasn't resolved there, resolve it here as part of building the canvas (the canvas is the natural place for it) — but if it's genuinely ambiguous, ask Luc rather than guessing.
- Once this batch is visibly working end to end, it's worth sending Luc a short screen recording or screenshots of the canvas — this is the biggest visual/interactive feature built in this project so far, and he's been iterating closely on the mockups leading up to it.
