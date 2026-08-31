## Task: Item Feeds, Tasks, Flow Links — data model + API clients — BL-055 to BL-059

**Supersedes the version of this prompt delivered earlier 2026-08-30** — Luc reviewed the mockups and revised the design the same day before any of this was built: Item Feeds now support multiple GTINs, `PRESENT` gains an "all GTINs present" mode, and a Feed's connection to a Channel is itself a graph edge (`FeedLink`) rather than a field stored on the Channel input — see the framing note below and Phases 4/5, both rewritten. If you started from the earlier version of this prompt, stop and re-read from here.

Full spec: `CLAUDE-CONCEPT.md` section 16 (added 2026-08-30, revised later the same day — Item Feed, Task, Feed Node/Feed Link/Flow Link, the run/automation model, and the migration note in 16.6), sections 7.6/7.7/7.8 (the three Bartender APIs this batch wires up), section 13's two 2026-08-30 decision-log entries (initial design, then the same-day revision). Backlog: `BACKLOG.md` section 6 (BL-055 to BL-062) and BL-003 (now resolved). Mockups delivered by Cowork, not yet in the repo — ask Luc to share them if useful for reference, they're not required to complete this batch: `item-feeds-and-flow-links.html` (predates the Feed Node revision, still useful for the NEW/PRESENT/FIXED field breakdown), `workflow-canvas-editor.html` (also predates the revision — an updated version is expected from Cowork before Part 2 starts).

This is **Part 1 of 2**. This batch builds the data model and the three API clients Item Feeds depend on, plus a first usable Item Feed library UI. **Part 2** (separate prompt, `claude-code-prompt-BL060-061-workflow-canvas-and-automation.md`) builds the graph canvas and the run engine on top of what this batch creates — don't build the canvas here.

### Important framing before you start

- **This resolves BL-003** (core entity model) — a Workflow is a graph of Tasks (each attached to one Device), Feed Nodes (each an instance of a reusable Item Feed), and two kinds of edges: Feed Links (Feed Node → Task Channel) and Flow Links (Task Channel → Task Channel). This is new ground, not an extension of an existing feature like the last few batches.
- **`Device.workflowId` (the direct FK from BL-042/section 15.2) is superseded.** A Device now relates to a Workflow *through* a Task: `Device` 1:1 `Task`, `Task` many-to-one `Workflow`. Part of this batch (BL-059) is making that schema change and updating `lib/deviceState.ts` accordingly — see Phase 5 below. Existing seed fixtures get re-seeded as Tasks, not migrated row-for-row, same approach as BL-042/BL-049's own redesigns.
- **A Channel's inbound connections are no longer an exclusive single choice.** There is deliberately no `TaskChannelInput.inputType` field in this revision — a Channel is fed by whatever combination of Feed Links and Flow Links happen to target it, including several of either kind at once ("I want... multiple feeds as input of a device" — Luc, 2026-08-30). Don't reintroduce an exclusive-choice field.
- **Safety-critical**: BL-056's Serialization API client mints real, permanent items on Luc's live Bartender tenant every time it's called. The 10-item cap (see Phase 2) must be enforced *inside the client itself*, not just hoped for at call sites — treat this the same way `POST /collectors/register` calls are treated as real, consequential writes. This matters more now that a Feed can list several GTINs — the cap is on the **total** items per firing, not per GTIN.
- Three legacy/temporary APIs here (7.6 Serialization, 7.7 Product) are explicitly stand-ins Luc flagged as temporary until `serialization-api-v3-updated`/`master-data-api` (already in the project's doc list, confirmed not yet available) go live. Build them as swappable clients (a clear `lib/bartenderX.ts` module boundary) so replacing them later doesn't ripple through the Item Feed UI/logic.
- **Also part of this batch (BL-062)**: remove the "Serialized Items" sidebar nav item — Luc's direct request, since Item Feed absorbs that concept entirely. Small, do it alongside Phase 4/5's UI work rather than as a separate pass.

### Phase 1 — Legacy Product API client (BL-055)

New file `lib/bartenderProducts.ts`, structured like `lib/bartenderLocations.ts` (this API is reached at `{tenantUrl}/product-api/rest/...`, same per-tenant-subdomain pattern as `statemachine-api-configuration`, not a fixed gateway host — see `CLAUDE-CONCEPT.md` section 7.7).

- Auth: HTTP Basic — reuse the existing `bartenderUsername`/`bartenderPasswordCiphertext` fields and `lib/crypto.ts` decrypt pattern already used for the legacy maps workaround (BL-040/section 7.4). Don't add a fourth credential type.
- Three functions:
  - `listProducts(tenantUrl, username, password, opts?)` → `GET /products?showAttributes=true`, header `Accept-version: v3.6`. **This endpoint is documented as "can be huge"** — the first real call should confirm whether a search/filter/pagination query param actually exists (check the raw response and any response headers for hints); if genuinely none exists, don't build an unbounded "browse all products" UI — cap what you fetch/cache and tell Luc what you found so a real search strategy can be decided (client-side filter over a capped page, or ask him for a filter param that isn't documented).
  - `getProduct(tenantUrl, username, password, gtin)` → `GET /products/{gtin}`, header `Accept-version: v3.5`. Note the **different Accept-version header from `listProducts`** — this is exactly what's in the spec Luc pasted, not a typo to "fix"; keep them different.
  - `listCategories(tenantUrl, username, password)` → `GET /categories?show_level=true`, header `Accept-version: v3.6`.
- After the first real call to each, record the actual response shape in `CLAUDE-CONCEPT.md` section 7.7 (it's currently undocumented — none was included in what Luc provided), same as how section 7.2 was updated after its first live call.
- UI: a small reusable picker component (product search by name/GTIN, or browse-by-category), used by Phase 4's Item Feed form. Keep it a standalone component (`components/ProductPicker.tsx` or similar) — Phase 2 (Part 2 prompt) doesn't need it, but Phase 4 below does.

### Phase 2 — Legacy Serialization API client (BL-056)

New file `lib/bartenderSerialization.ts`.

```ts
export const MAX_NEW_ITEMS_PER_FIRING = 10; // Luc's explicit safety cap, 2026-08-30 — "we will level up
  // the limit later when it is fully baked in." Do not raise this without an explicit instruction from Luc.
  // This is a TOTAL across however many GTINs a single firing touches, not a per-GTIN allowance.

async function mintForOneGtin(
  tenantUrl: string, username: string, password: string,
  gtin: string, quantity: number
): Promise<string[]> {
  // GET {tenantUrl}/serialization-api/rest/serialization/hexas/sgtin96/gtin/{gtin}?quantity={quantity}
  // HTTP Basic auth (same credential as Phase 1). Response: plain JSON array of hex EPC strings.
  // ...
}

// Called by the run engine (Part 2) for a NEW-kind Item Feed's firing. `gtins` is the Feed's full
// GTIN list (one or more, per the 2026-08-30 multi-GTIN revision). Splits the capped total quantity
// across the listed GTINs by assigning each unit a uniformly random GTIN from the list — see
// CLAUDE-CONCEPT.md 16.1's "quantity-across-multiple-GTINs" assumption, flagged as not yet confirmed
// by Luc — until he says otherwise, this is the allocation policy to build.
export async function mintSerializedItems(
  tenantUrl: string, username: string, password: string,
  gtins: string[], quantity: number
): Promise<{ gtin: string; epc: string }[]> {
  const cappedQuantity = Math.max(1, Math.min(quantity, MAX_NEW_ITEMS_PER_FIRING));
  // Assign each of the cappedQuantity units a random gtin from gtins, group by gtin, call
  // mintForOneGtin once per distinct gtin with that gtin's unit count, flatten the results back
  // into a single { gtin, epc }[] so the caller knows which item is which GTIN.
}
```

- Auth: same HTTP Basic username/password as Phase 1.
- **The cap is enforced by clamping the total inside this function, silently** — a caller asking for more than 10 across all listed GTINs gets 10 total, not an error, and not 10-per-GTIN. Log/surface (don't just swallow) whenever a request was actually clamped, so it's visible during testing that the cap is doing something.
- **When you test this live, use `quantity=1` and a single GTIN, and expect a real, permanent write to Luc's sandbox tenant** — same discipline as BL-053's Phase 0 test-and-deregister pattern, except there is no "undo" here (no deregister-equivalent for serialized items). Don't loop this call for testing under any circumstances, and don't test the multi-GTIN split with anything beyond the minimum needed to confirm it works (e.g. `quantity=2` across two GTINs is enough to prove the split logic without generating more than necessary).
- Confirm the response shape live (`["3034DF978000FA400000005C"]` per what Luc pasted) and note if it differs.

### Phase 3 — Inventory API client (BL-057)

New file `lib/bartenderInventory.ts`.

- **Auth needs a live check before you assume anything** — the spec text implies HTTP Basic *and* an `apiKey` header together, and one example also shows `x-tenant`. Try the combination the spec literally describes first; if it 401s, try the two-header combos already proven for other APIs in this app (bare `apikey` alone; Basic alone) and record whichever one actually works in `CLAUDE-CONCEPT.md` section 7.8, same as the `location-api-v2` header correction (section 7.3) was recorded.
- Gateway: spec only lists `https://api.bartender-tt.com/inventory` (Production). Try the same `api.sandbox.bartender-tt.com` pattern used by `location-api-v2`/`datacollector-api-v3` for the sandbox case, derived from `bartenderTenantUrl` containing `sandbox` — confirm live and record the result either way.
- One function: `getStock(gatewayUrl, credentials, { locationCode, zoneCode, pids, groupBy })` → `GET /stock`, `groupBy=zone` for this app's use case. **`pids` is an array, and can be omitted/empty** — a `PRESENT` Item Feed's "all GTINs present" mode (2026-08-30 revision) means calling this with no `pid` filter at all, returning whatever's actually in that zone regardless of product. Returns `{ results: [{ locationCode, zoneCode, sku, pid, productLabel, qty, lastSeenAt }], ... }` per the spec — confirm live and record any differences.
- Not needed yet by anything built in this batch except as a dependency of Phase 4's `PRESENT` kind — no standalone UI for it.

### Phase 4 — `ItemFeed` model + CRUD + library UI (BL-058, revised 2026-08-30)

Add to `prisma/schema.prisma`:

```prisma
enum ItemFeedKind {
  NEW
  PRESENT
  FIXED
}

enum PresentMatchMode {
  GTIN_LIST // match only the GTINs listed in `gtins`
  ALL       // match whatever's present in the zone, no GTIN filter — PRESENT-only
}

model ItemFeed {
  id   String       @id @default(cuid())
  name String
  kind ItemFeedKind

  // NEW: one or more GTINs, required, ALWAYS a concrete list (minting needs
  // a real GTIN per call — there's no "mint all" equivalent to PRESENT's
  // ALL mode). PRESENT: used only when presentMatchMode = GTIN_LIST: one
  // GTIN, several, doesn't matter — same field either way (2026-08-30
  // revision: a Feed is no longer limited to a single GTIN).
  gtins        Json?             // string[]
  categoryCode String?           // optional bulk-add-by-category helper at authoring time — resolves into `gtins`, not stored as a live reference (CLAUDE-CONCEPT.md 16.1's "open runtime detail")

  // PRESENT only, default GTIN_LIST. ALL means "match anything present in
  // the zone" — ignore `gtins` entirely when this is ALL.
  presentMatchMode PresentMatchMode?

  // NEW/PRESENT only. Equal min/max = a fixed count each firing. The total
  // (post-10-cap for NEW) is split across `gtins` per lib/bartenderSerialization.ts's
  // mintSerializedItems allocation policy; for PRESENT with ALL, there's no
  // GTIN list to split across — just pull up to the quantity from whatever
  // GET /stock returns for that zone.
  quantityMin Int?
  quantityMax Int?

  // PRESENT only — a specific site+zone queried via the Inventory API.
  locationCode String?
  zoneCode     String?

  // FIXED only — explicit EPC hex or URN strings, user-entered, confirmed
  // 2026-08-30 (not a GTIN+quantity recipe).
  fixedItems Json? // string[]

  feedNodes FeedNode[] // Phase 5 below — each is one canvas placement of this Feed

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

(`FeedNode` doesn't exist yet — it's Phase 5 below; Prisma is fine with the forward reference once both models are in the same migration.)

Migrate: `npx prisma migrate dev --name add_item_feed`.

- `app/api/item-feeds/route.ts` (`GET` list, `POST` create) and `app/api/item-feeds/[id]/route.ts` (`GET`/`PATCH`/`DELETE`). Validate kind-specific required fields server-side: `FIXED` requires a non-empty `fixedItems`; `NEW` requires a non-empty `gtins`; `PRESENT` requires `locationCode`+`zoneCode`, and requires `gtins` non-empty **only** when `presentMatchMode` is `GTIN_LIST` (empty/absent `gtins` is valid and expected when `presentMatchMode` is `ALL`) — mirror `lib/deviceConfig.ts`'s `validateChannels` pattern (400 on malformed input).
- A library page (own nav entry or a tab — your call on where it fits best in the existing shell now that BL-062 removes "Serialized Items", flag to Luc if genuinely ambiguous) listing all Item Feeds with a kind badge, and a **kind-specific creation/edit dialog carrying its own explanatory info text for each of the three kinds** — Luc's explicit ask, 2026-08-30 ("the creation dialog should be different and have an info text explaining what it does (info also for NEW or FIXED)"), not just a note on `PRESENT`. Branch the form on kind:
  - **NEW**: multi-GTIN picker (Phase 1's component, multi-select mode) + quantity range. Info text: plain language that this mints real, permanent items on the live Bartender tenant.
  - **PRESENT**: a `GTIN_LIST` (multi-GTIN picker) vs. `ALL` toggle, + zone picker (resolving zones via the already-integrated `location-api-v2` `GET /locations/{code}/zones`) + quantity range. Info text: explains this pulls from what's actually recorded as present in that zone right now, and can come back with fewer items (or none) than requested.
  - **FIXED**: a repeatable text-input list (EPC hex or URN), reusing the `.attr-row`/`.attr-add-link` pattern already used for Channels/Attributes elsewhere in this app. Info text: explains the same fixed items are sent every time this Feed fires.
  - Delete with a usage-count warning if the Item Feed is referenced by any `FeedNode` (once Phase 5 exists — until then, deletion has nothing to block on).
- This same creation form is reused verbatim by Part 2's canvas "+ New Feed" inline flow — build it as a standalone component (`components/ItemFeedForm.tsx` or similar) callable from either a full page and a canvas-triggered modal/panel, not baked into one specific page's markup.

### Phase 5 — `Task`, `FeedNode`, `FeedLink`, `FlowLink` models, `Device.workflowId` migration (BL-059, revised 2026-08-30)

**No `TaskChannelInput.inputType`/exclusive-choice field in this revision.** A Channel's "is it fed, and by what" is derived from which `FeedLink`s/`FlowLink`s actually target it — a Channel can have any number of each, simultaneously (Luc's explicit ask: "multiple feeds as input of a device"). Add to `prisma/schema.prisma`:

```prisma
model Task {
  id         String   @id @default(cuid())
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  deviceId   String   @unique // one Device belongs to at most one Task at a time (16.8's open assumption)
  device     Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  name       String?  // defaults to the Device's own name if not set explicitly
  positionX  Int?      // canvas position, set by Part 2's editor
  positionY  Int?

  incomingFeedLinks FeedLink[]
  outgoingFlowLinks FlowLink[] @relation("FlowLinkSource")
  incomingFlowLinks FlowLink[] @relation("FlowLinkTarget")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// One placement of a reusable ItemFeed onto one Workflow's canvas. The same
// ItemFeed can have many FeedNodes — same canvas or different Workflows —
// each independently positioned (2026-08-30: "A same feed can be
// instantiated and use at multiple input position on a diagram").
model FeedNode {
  id         String   @id @default(cuid())
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  itemFeedId String
  itemFeed   ItemFeed @relation(fields: [itemFeedId], references: [id], onDelete: Cascade) // deleting the definition removes its placements too
  positionX  Int?
  positionY  Int?

  feedLinks FeedLink[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// Edge: one FeedNode's output -> one Task's Channel input. Cadence lives
// here (not on the Channel) since a Channel can have several FeedLinks.
model FeedLink {
  id         String   @id @default(cuid())
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  feedNodeId String
  feedNode   FeedNode @relation(fields: [feedNodeId], references: [id], onDelete: Cascade)

  targetTaskId    String
  targetTask      Task   @relation(fields: [targetTaskId], references: [id], onDelete: Cascade)
  targetChannelId String // matches an id in the Device's own `channels` Json array, e.g. "CH1"

  fireIntervalSeconds Int // how often this edge fires a fresh batch while the Workflow is RUNNING — set by Part 2's canvas

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model FlowLink {
  id         String   @id @default(cuid())
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  sourceTaskId    String
  sourceTask      Task   @relation("FlowLinkSource", fields: [sourceTaskId], references: [id], onDelete: Cascade)
  sourceChannelId String

  targetTaskId    String
  targetTask      Task   @relation("FlowLinkTarget", fields: [targetTaskId], references: [id], onDelete: Cascade)
  targetChannelId String

  delayMinSeconds Int @default(0)
  delayMaxSeconds Int @default(0)

  filterGtins         Json?   // string[] — null/empty means "no GTIN filter"
  filterCategoryCodes Json?   // string[]
  isElse              Boolean @default(false) // at most one true per (sourceTaskId, sourceChannelId) — app-enforced, not a DB constraint

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Extend `Workflow`:

```prisma
model Workflow {
  id        String         @id @default(cuid())
  name      String
  status    WorkflowStatus @default(RUNNING)

  // Safety auto-stop, added for the run engine (BL-061, Part 2). No default
  // duration specified by Luc yet — ship a conservative placeholder (e.g.
  // 240 minutes / 4 hours) and confirm/adjust with him once this is visible
  // in the UI, don't treat the placeholder as final.
  maxRunDurationMinutes Int?      @default(240)
  runningStartedAt      DateTime? // set when flipped to RUNNING, cleared on STOPPED
  autoStoppedAt         DateTime? // set by the cron job (Part 2) when IT stops the run, vs. a manual stop — lets the UI explain why

  tasks     Task[]
  feedNodes FeedNode[]
  feedLinks FeedLink[]
  flowLinks FlowLink[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Remove `Device.workflowId`/`Device.workflow` entirely** — a Device relates to its Workflow through `Task` now (`device.task?.workflow`). Update:
- `lib/deviceState.ts`'s `getDeviceState()` — same Off/Active/Automated/Problem logic, just re-pointed to `device.task?.workflow?.status` instead of `device.workflow?.status`.
- Any query that used to `include: { workflow: true }` on `Device` needs `include: { task: { include: { workflow: true } } }` instead — grep for `.workflow` usages on `Device` (routes, `DeviceConfigModal.tsx`'s workflow select, the Devices list, `LocationMapCard.tsx`'s read-only info panel) and update each.
- `DeviceConfigModal.tsx`'s existing Workflow select (populated from `GET /api/workflows`) — decide whether assigning a Workflow directly from the Device modal still makes sense now that the real relationship is via a Task, or whether that assignment should move to the (Part 2) canvas instead. If genuinely unclear, ask Luc rather than guessing — this is a real UX fork, not just a schema rename.

Migrate: `npx prisma migrate dev --name add_task_feednode_feedlink_flowlink_and_workflow_automation_fields`.

**Re-seed, don't migrate data**: rewrite `prisma/seed-devices.mjs` (or a new seed script) so existing Device/Workflow fixtures get wrapped in `Task` rows (one Task per already-`workflowId`-attached Device, same Workflow), plus a couple of `ItemFeed`/`FeedNode`/`FeedLink` fixtures so Part 2's canvas has something realistic to open onto — rather than attempting to carry old `Device.workflowId` values through the schema change. Consistent with how BL-042 and BL-049 both simply rewrote and re-ran the seed script on their own schema changes.

No dedicated Task/FeedNode/FeedLink/FlowLink UI in this batch — CRUD API routes only (`app/api/tasks/...`, `app/api/feed-nodes/...`, `app/api/feed-links/...`, `app/api/flow-links/...`), enough for Part 2's canvas to call. Building the canvas itself is out of scope here.

### Verify

- `npm run build` passes; `npx prisma migrate dev` runs cleanly against the local dev DB.
- Every existing Devices/Overview page that used to read `device.workflow` still shows correct Automated/Problem coloring after the re-seed (spot-check at least one Device on each Workflow fixture).
- Item Feed CRUD round-trip for all three kinds (create/edit/delete), including the kind-specific validation (`FIXED` rejects an empty item list, `NEW` rejects an empty `gtins`, `PRESENT` rejects `GTIN_LIST` mode with an empty `gtins` but accepts `ALL` mode with none).
- `mintSerializedItems` — call it once live with `quantity: 1` and a single GTIN against Luc's sandbox tenant, confirm a real hex EPC comes back; separately confirm a call requesting e.g. `quantity: 50` across one GTIN actually gets clamped to 10 total (check the raw request(s) sent, not just the returned array length), and that a call across two GTINs still sums to the capped total, not 10-per-GTIN.
- `GET /stock` (Phase 3) — one live call against a real site/zone from the seeded fixtures with a `pids` filter, and one call with no `pids` filter (the `ALL` mode case) — confirm both return sensibly.
- Confirm two separate `FeedNode` rows can reference the same `ItemFeed`, and that two `FeedLink`s (or a `FeedLink` and a `FlowLink`) can target the same Task/Channel without any unique-constraint error — this is the "multiple feeds as input of a device" requirement, verify it's actually possible at the data layer even though the UI to exercise it visually is Part 2's job.

### Phase 6 — Remove "Serialized Items" from the sidebar nav (BL-062)

Small, direct request from Luc: "Please remove the 'Serialized Item' menu item as it makes no sense." Remove it from the sidebar nav list (wherever `app/(app)/layout.tsx` or the sidebar component enumerates nav items) and whatever placeholder route/page currently backs it — check if there's a `/serialized-items` (or similar) route with just a "coming soon" placeholder and remove that too, rather than leaving a dead route reachable by URL.

### Verify (BL-062)

- The sidebar no longer shows a Serialized Items entry, in both collapsed and expanded states.
- Navigating directly to whatever URL used to back it either 404s cleanly or redirects — no dead placeholder page left reachable.

### Conventions (same as every previous batch)

- Work on `staging`. Commit message(s) reference the BL numbers covered. `npm version minor --no-git-tag-version` (new features, no letter suffix) — one bump per commit, at the point you're ready to commit, not per individual model added.
- Record every live-API finding (Product API response shapes, Serialization API response shape, Inventory API auth/gateway) as dated additions to the relevant `CLAUDE-CONCEPT.md` section 7.x, the same way every previous API integration in this project has been corrected/extended after first real contact.
- If the Product API's "can it search/filter" question, or the `DeviceConfigModal`'s Workflow-select UX fork, turn out genuinely ambiguous once you're looking at it — ask Luc rather than guessing silently, per `CLAUDE.md`'s standing instruction.
- Separately, unrelated to this batch but worth flagging to Luc once you're in a normal conversation with him: BL-053's own completion note recorded that `heartbeatConfig`'s exact request shape is still unresolved (10+ shapes tried, all rejected) and the DataCollector API's YAML isn't in this project — that's still open and needs the schema from him, independent of this Item Feed/Task work.
