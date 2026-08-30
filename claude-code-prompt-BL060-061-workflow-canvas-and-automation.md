## Task: Workflow canvas editor + run/automation engine — BL-060, BL-061

Full spec: `CLAUDE-CONCEPT.md` section 16.4 (canvas UI) and 16.5 (run & automation engine), section 13's 2026-08-30 decision-log entry. Backlog: `BACKLOG.md` BL-060/BL-061. Mockups delivered by Cowork, not yet in the repo, worth asking Luc for as visual reference (not required to complete this batch — the spec below is self-contained): `item-feeds-and-flow-links.html`, `workflow-canvas-editor.html` (this one is an interactive HTML demo of the exact edge-click-to-configure interaction this batch builds for real).

**This is Part 2 of 2 — depends on Part 1 (`claude-code-prompt-BL055-059-item-feeds-and-tasks.md`) being merged first.** It needs `ItemFeed`, `Task`, `TaskChannelInput`, `FlowLink`, and the extended `Workflow` model (with `maxRunDurationMinutes`/`runningStartedAt`/`autoStoppedAt`) to already exist, plus their CRUD API routes. Don't start this batch until Part 1 is on `staging`.

### Important framing before you start

- **The canvas is the real authoring surface for Workflows** — dragging Devices in as Tasks, wiring Flow Links, configuring delay/filter. There is no separate form-based Workflow builder to fall back to; this replaces the "no dedicated authoring UI yet" note from BL-042/section 15.2.
- **Automation must survive nobody being logged in.** This is the one requirement in this batch that isn't just UI — a Workflow that's `RUNNING` keeps firing on a server-side schedule regardless of whether anyone has the app open. Get Phase 0 right before writing any of the run-engine code; building the firing logic against an assumption about Cron frequency that turns out wrong means reworking the whole trigger mechanism.
- **The 10-item `NEW` cap from Part 1's `lib/bartenderSerialization.ts` fires automatically here, unattended, on a timer — there is deliberately no manual "generate now" step.** Don't add one; Luc was explicit the cap itself is the safety net, not a human-in-the-loop gate.
- No live token animation on the canvas is requested for this batch (Luc's explicit call, 2026-08-30) — build the plain run/activity log described in Phase 5 instead. Don't over-invest in canvas visual polish beyond what's needed to configure the graph clearly.

### Phase 0 — Mandatory live check before building the scheduler (blocking)

Vercel Cron's minimum firing frequency differs by plan. Per-Task `fireIntervalSeconds` (as low as tens of seconds, per the design) needs the scheduler to actually tick at least every minute or so — a plan that only allows daily cron invocations makes the whole "keeps running unattended" requirement unworkable as designed.

1. Check what Luc's actual Vercel plan/team allows for Cron job frequency (Vercel's dashboard/docs for the "ChefMate" team this project is hosted under — see `BACKLOG.md` BL-005).
2. **If a sub-hourly (ideally every-minute) cron schedule is available**: proceed with native Vercel Cron as designed (Phase 4 below).
3. **If it isn't** (e.g. limited to once/day on the current plan): don't silently build something that can't meet the spec. Fall back to an external free scheduler (e.g. cron-job.org, or any other reliable free tier) configured to hit this app's protected tick route every minute using a shared-secret header — functionally identical to Vercel Cron from the app's own code's point of view, just triggered externally. Either way, record which mechanism ended up used, and why, as a dated note in `CLAUDE-CONCEPT.md` section 16.5 — this is exactly the kind of "checked live, here's what's actually true" correction this project's decision log exists for.

Don't guess past this — if the plan situation is genuinely unclear, ask Luc rather than assuming either outcome.

### Phase 1 — Canvas shell, palette, Task nodes

Install `@xyflow/react` (React Flow, MIT-licensed).

- A Workflow detail/edit page (`/workflows/[id]`, or wherever fits the existing nav — `app/(app)/workflows/` currently has no dedicated authoring UI, per BL-042's note) hosting the canvas full-height, toolbar on top: Workflow name (editable inline), a Run/Stop toggle (writes `Workflow.status`, and on flipping to `RUNNING` sets `runningStartedAt = now()` and clears `autoStoppedAt`; on flipping to `STOPPED` — by a user, not the auto-stop job — clears `runningStartedAt`), Save.
- Left palette: lists the tenant's configured Devices not already attached to a Task in *this* Workflow (a Device can belong to at most one Task at a time, per Part 1's `Task.deviceId @unique` — if a Device already has a Task elsewhere, don't offer it, or offer it with a clear "already in use in <Workflow name>" state, your call on which reads better).
- Dragging a palette Device onto the canvas creates a `Task` (`POST /api/tasks`) at the drop position, rendered as a custom React Flow node: header (Device name/type icon/collector id), then one row per Channel from the Device's own `channels` Json array — each row is a named handle (`channelId`, e.g. `CH1`) positioned left (inbound) or right (outbound) depending on whether that Channel is realistically a source or sink; a `PRESENCE`/`DIRECTIONAL` Channel can in principle be either, so **don't hardcode left/right by Channel type** — instead derive it from whether that Channel currently has any `TaskChannelInput` (making it an input) vs. whether it's the source of any `FlowLink` (making it an output); a Channel with neither yet should expose handles on both sides until the user commits it one way by making a connection or an assignment.
- Clicking an unassigned Channel row opens a small picker: existing Item Feed (from Part 1's library) or "+ New Item Feed" (reuses Part 1's create form), setting that Channel's `TaskChannelInput.inputType = ITEM_FEED` + `itemFeedId` + a `fireIntervalSeconds` field (new, this batch — how often this entry point fires while `RUNNING`).
- Persist node position on drag-end (`PATCH /api/tasks/[id]` with `positionX`/`positionY`).

### Phase 2 — Flow Links: drag-to-connect, click-to-configure

- Dragging from an output handle to another Task's input handle calls `POST /api/flow-links` creating a `FlowLink` with default `delayMinSeconds`/`delayMaxSeconds: 0` and no filter, and sets the target Channel's `TaskChannelInput.inputType = FLOW_LINK` (clearing any previous `ITEM_FEED` assignment on that Channel — a Channel is either fed by one Item Feed or by any number of Flow Links, never both at once, per `CLAUDE-CONCEPT.md` 16.2).
- Custom edge component: a clickable label chip (matching `workflow-canvas-editor.html`'s interaction) showing the delay range (and filter summary, or "else" if `isElse`). Clicking opens an inline panel: delay min/max number inputs, a GTIN/category filter (reuse Part 1's product picker), and an "else / catch-all" toggle.
- **Enforce at most one `isElse: true` edge per `(sourceTaskId, sourceChannelId)`** — app-level validation on save (this isn't a DB constraint in Part 1's schema), clear error if the user tries to mark a second one.
- No fan-in limit on a target Channel (confirmed by Luc — "not limited, many upstream task to this one") — don't add validation that blocks multiple Flow Links into the same target.
- Deleting an edge or a node cascades sensibly: deleting a `FlowLink` should reset its target Channel's `TaskChannelInput` back to `NONE` if nothing else feeds it; deleting a `Task` should delete its own `TaskChannelInput`s and any `FlowLink`s touching it (the Prisma `onDelete: Cascade` in Part 1's schema handles the DB side — make sure the UI actually calls delete rather than just hiding the node).

### Phase 3 — Run & automation engine (BL-061)

New model, add to `prisma/schema.prisma`:

```prisma
model InFlightBatch {
  id         String    @id @default(cuid())
  workflowId String
  workflow   Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  taskId     String
  channelId  String
  items      Json      // string[] — EPC hex or URN
  gtin       String?
  arrivesAt  DateTime  // when this batch should be "read" at (taskId, channelId)
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

Migrate: `npx prisma migrate dev --name add_workflow_run_engine`.

New protected route, e.g. `app/api/cron/workflow-tick/route.ts`, guarded by a shared-secret header (`CRON_SECRET` env var, standard Vercel Cron pattern — reject any request missing/mismatching it). On each tick:

1. **Firing**: for every `TaskChannelInput` with `inputType: ITEM_FEED` whose `Task.workflow.status === "RUNNING"`, check whether it's due (track last-fired time — either a new `lastFiredAt` field on `TaskChannelInput`, or derive it from the most recent `InFlightBatch`/`SimulatedRead` at that `(taskId, channelId)`; a new explicit field is simpler and cheaper to query, prefer that). If due: resolve the batch via the Item Feed's kind (`NEW` → Part 1's `mintSerializedItems`, capped at 10; `PRESENT` → Part 1's `getStock` against the configured zone, pulling up to the configured quantity from what's actually there, zero if none; `FIXED` → the stored explicit list, every time). Write a `SimulatedRead` immediately for this firing, and an `InFlightBatch` per **outgoing** `FlowLink` from that Task/Channel whose filter matches this batch's GTIN (or the `isElse` edge, for anything unmatched) — `arrivesAt = now + random(delayMinSeconds, delayMaxSeconds)`.
2. **Arrivals**: for every unprocessed `InFlightBatch` with `arrivesAt <= now`, write a `SimulatedRead` at its `(taskId, channelId)`, then repeat step 1's "evaluate outgoing Flow Links" logic from *that* Task/Channel to schedule the next hop(s) — recursively, until a batch reaches a Task/Channel with no outgoing Flow Links (a terminal point — its journey just ends). Mark the `InFlightBatch` `processedAt = now`.
3. **Auto-stop**: for every `Workflow` with `status: "RUNNING"` and a non-null `runningStartedAt`, if `now - runningStartedAt > maxRunDurationMinutes`, set `status: "STOPPED"`, `autoStoppedAt: now`, and leave `runningStartedAt` as-is (so the UI can show "auto-stopped after running since <time>", not just "stopped").

Keep the tick idempotent and safe to run concurrently/overlapping (a slow tick shouldn't double-fire if Cron invokes again before the previous run finishes) — a simple approach is fine here (e.g. a short-lived advisory lock row, or accepting that a rare double-fire just means one extra `NEW` batch under the existing 10-cap is not a serious problem) — don't over-engineer this, just don't leave it completely unguarded either.

`vercel.json` (or the Vercel dashboard, if that's the current project's convention) needs the Cron schedule wired to this route, at whatever frequency Phase 0 confirmed is available; if the external-scheduler fallback applies instead, document the exact URL+secret setup Luc needs to configure on that external service's side.

### Phase 4 — Auto-stop default duration

Part 1 shipped `Workflow.maxRunDurationMinutes` with a placeholder default (240 minutes / 4 hours). Surface it as an editable field in this batch's canvas toolbar (or a small Workflow settings panel) rather than leaving it buried — and flag to Luc directly once this is visible and testable that the default is a placeholder he should confirm or change, per `CLAUDE-CONCEPT.md` 16.8.

### Phase 5 — Minimal run/activity visibility

No animation (per Luc, 2026-08-30) — but some visibility that automation is actually happening is worth having for both Luc and future debugging. A simple `SimulatedRead` log view is enough: a table/list (own tab on the Workflow page, or a slide-over panel) showing recent reads for this Workflow — time, Task name, Channel, item count, GTIN if known — newest first, auto-refreshing or manually refreshable, your call on which fits the existing patterns in this app better (e.g. the Devices list's plain table vs. something more live). Don't build more than this without Luc asking for it.

### Verify

- Phase 0's Cron-frequency finding is recorded in `CLAUDE-CONCEPT.md` before Phase 3 is built against it.
- Full drag-and-drop round trip: drag a Device in, assign an Item Feed to one Channel, drag a Flow Link to a second Task, click the edge and set a delay+filter, mark a second outgoing edge as `else`, save, reload the page — everything persists and re-renders correctly.
- Start a Workflow (`Run`), wait past at least one entry Channel's `fireIntervalSeconds`, confirm a `SimulatedRead` was actually created (via Phase 5's log or a direct DB check) without anyone having the page open in a browser tab in the meantime — this is the actual test of the "runs unattended" requirement, not just that the UI button works.
- Confirm the 10-item `NEW` cap holds even under automated firing (not just the one-off call tested in Part 1) — set a `NEW` Item Feed's `quantityMax` above 10, let it fire automatically, confirm the resulting `SimulatedRead`/`InFlightBatch` items array is capped at 10.
- Confirm a Workflow left `RUNNING` past its `maxRunDurationMinutes` actually flips to `STOPPED` with `autoStoppedAt` set, without a user action.
- `npm run build` passes; `npx prisma migrate dev` runs cleanly.

### Conventions (same as every previous batch)

- Work on `staging`. `npm version minor --no-git-tag-version` (new features, no letter suffix).
- Record every live finding (Cron plan limits, any auth/response-shape surprise from Part 1's clients surfacing here under real automated load) as dated `CLAUDE-CONCEPT.md` additions.
- If the "which Task gets to assign a Workflow" UX fork flagged at the end of Part 1's prompt wasn't resolved there, resolve it here as part of building the canvas (the canvas is the natural place for it) — but if it's genuinely ambiguous, ask Luc rather than guessing.
