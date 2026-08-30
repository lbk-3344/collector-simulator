## Task: Item Feeds, Tasks, Flow Links — data model + API clients — BL-055 to BL-059

Full spec: `CLAUDE-CONCEPT.md` section 16 (added 2026-08-30 — Item Feed, Task, Flow Link, the run/automation model, and the migration note in 16.6), sections 7.6/7.7/7.8 (the three Bartender APIs this batch wires up), section 13's 2026-08-30 decision-log entry. Backlog: `BACKLOG.md` section 6 (BL-055 to BL-061) and BL-003 (now resolved). Mockups delivered by Cowork, not yet in the repo — ask Luc to share them if useful for reference, they're not required to complete this batch: `item-feeds-and-flow-links.html`, `workflow-canvas-editor.html`.

This is **Part 1 of 2**. This batch builds the data model and the three API clients Item Feeds depend on, plus a first usable Item Feed library UI. **Part 2** (separate prompt, `claude-code-prompt-BL060-061-workflow-canvas-and-automation.md`) builds the graph canvas and the run engine on top of what this batch creates — don't build the canvas here.

### Important framing before you start

- **This resolves BL-003** (core entity model) — a Workflow is a graph of Tasks (each attached to one Device) connected by Flow Links. This is new ground, not an extension of an existing feature like the last few batches.
- **`Device.workflowId` (the direct FK from BL-042/section 15.2) is superseded.** A Device now relates to a Workflow *through* a Task: `Device` 1:1 `Task`, `Task` many-to-one `Workflow`. Part of this batch (BL-059) is making that schema change and updating `lib/deviceState.ts` accordingly — see Phase 4 below. Existing seed fixtures get re-seeded as Tasks, not migrated row-for-row, same approach as BL-042/BL-049's own redesigns.
- **Safety-critical**: BL-056's Serialization API client mints real, permanent items on Luc's live Bartender tenant every time it's called. The 10-item cap (see Phase 2) must be enforced *inside the client itself*, not just hoped for at call sites — treat this the same way `POST /collectors/register` calls are treated as real, consequential writes.
- Three legacy/temporary APIs here (7.6 Serialization, 7.7 Product) are explicitly stand-ins Luc flagged as temporary until `serialization-api-v3-updated`/`master-data-api` (already in the project's doc list, confirmed not yet available) go live. Build them as swappable clients (a clear `lib/bartenderX.ts` module boundary) so replacing them later doesn't ripple through the Item Feed UI/logic.

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

export async function mintSerializedItems(
  tenantUrl: string, username: string, password: string,
  gtin: string, quantity: number
): Promise<string[]> {
  const cappedQuantity = Math.max(1, Math.min(quantity, MAX_NEW_ITEMS_PER_FIRING));
  // GET {tenantUrl}/serialization-api/rest/serialization/hexas/sgtin96/gtin/{gtin}?quantity={cappedQuantity}
  // HTTP Basic auth (same credential as Phase 1). Response: plain JSON array of hex EPC strings.
  // ...
}
```

- Auth: same HTTP Basic username/password as Phase 1.
- **The cap is enforced by clamping inside this function, silently** — a caller asking for more than 10 gets 10, not an error. Log/surface (don't just swallow) whenever a request was actually clamped, so it's visible during testing that the cap is doing something.
- **When you test this live, use `quantity=1` and expect a real, permanent write to Luc's sandbox tenant** — same discipline as BL-053's Phase 0 test-and-deregister pattern, except there is no "undo" here (no deregister-equivalent for serialized items). Don't loop this call for testing under any circumstances.
- Confirm the response shape live (`["3034DF978000FA400000005C"]` per what Luc pasted) and note if it differs.

### Phase 3 — Inventory API client (BL-057)

New file `lib/bartenderInventory.ts`.

- **Auth needs a live check before you assume anything** — the spec text implies HTTP Basic *and* an `apiKey` header together, and one example also shows `x-tenant`. Try the combination the spec literally describes first; if it 401s, try the two-header combos already proven for other APIs in this app (bare `apikey` alone; Basic alone) and record whichever one actually works in `CLAUDE-CONCEPT.md` section 7.8, same as the `location-api-v2` header correction (section 7.3) was recorded.
- Gateway: spec only lists `https://api.bartender-tt.com/inventory` (Production). Try the same `api.sandbox.bartender-tt.com` pattern used by `location-api-v2`/`datacollector-api-v3` for the sandbox case, derived from `bartenderTenantUrl` containing `sandbox` — confirm live and record the result either way.
- One function: `getStock(gatewayUrl, credentials, { locationCode, zoneCode, pid, groupBy })` → `GET /stock`, `groupBy=zone` for this app's use case. Returns `{ results: [{ locationCode, zoneCode, sku, pid, productLabel, qty, lastSeenAt }], ... }` per the spec — confirm live and record any differences.
- Not needed yet by anything built in this batch except as a dependency of Phase 4's `PRESENT` kind — no standalone UI for it.

### Phase 4 — `ItemFeed` model + CRUD + library UI (BL-058)

Add to `prisma/schema.prisma`:

```prisma
enum ItemFeedKind {
  NEW
  PRESENT
  FIXED
}

model ItemFeed {
  id   String       @id @default(cuid())
  name String
  kind ItemFeedKind

  // Product selector — NEW/PRESENT only. Resolved to one concrete GTIN at
  // creation time via the Phase 1 picker (see CLAUDE-CONCEPT.md 16.1's
  // "open runtime detail" note — category is a finder, not a live per-firing
  // random pick, until Luc says otherwise).
  gtin         String?
  categoryCode String?

  // NEW/PRESENT only. Equal min/max = a fixed count each firing.
  quantityMin Int?
  quantityMax Int?

  // PRESENT only — a specific site+zone queried via the Inventory API.
  locationCode String?
  zoneCode     String?

  // FIXED only — explicit EPC hex or URN strings, user-entered, confirmed
  // 2026-08-30 (not a GTIN+quantity recipe).
  fixedItems Json? // string[]

  taskChannelInputs TaskChannelInput[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

(`TaskChannelInput` doesn't exist yet — it's Phase 5 below; Prisma is fine with the forward reference once both models are in the same migration.)

Migrate: `npx prisma migrate dev --name add_item_feed`.

- `app/api/item-feeds/route.ts` (`GET` list, `POST` create) and `app/api/item-feeds/[id]/route.ts` (`GET`/`PATCH`/`DELETE`). Validate kind-specific required fields server-side (e.g. `FIXED` requires a non-empty `fixedItems`, `PRESENT` requires `locationCode`+`zoneCode`) — mirror `lib/deviceConfig.ts`'s `validateChannels` pattern (400 on malformed input).
- A library page (own nav entry or a tab — your call on where it fits best in the existing shell, flag to Luc if genuinely ambiguous) listing all Item Feeds with a kind badge, create/edit form branching on kind (NEW: Phase 1 picker + quantity range; PRESENT: same + zone picker, resolving zones via the already-integrated `location-api-v2` `GET /locations/{code}/zones`; FIXED: a repeatable text-input list, reusing the `.attr-row`/`.attr-add-link` pattern already used for Channels/Attributes elsewhere in this app), delete with a usage-count warning if the Item Feed is referenced by any `TaskChannelInput` (once Phase 5 exists — until then, deletion has nothing to block on).

### Phase 5 — `Task`, `TaskChannelInput`, `FlowLink` models, `Device.workflowId` migration (BL-059)

Add to `prisma/schema.prisma`:

```prisma
enum TaskInputType {
  ITEM_FEED
  FLOW_LINK
  NONE
}

model Task {
  id         String   @id @default(cuid())
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  deviceId   String   @unique // one Device belongs to at most one Task at a time (16.8's open assumption)
  device     Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  name       String?  // defaults to the Device's own name if not set explicitly
  positionX  Int?      // canvas position, set by Part 2's editor
  positionY  Int?

  channelInputs TaskChannelInput[]
  outgoingLinks FlowLink[] @relation("FlowLinkSource")
  incomingLinks FlowLink[] @relation("FlowLinkTarget")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model TaskChannelInput {
  id        String        @id @default(cuid())
  taskId    String
  task      Task          @relation(fields: [taskId], references: [id], onDelete: Cascade)
  channelId String        // matches an id in the Device's own `channels` Json array, e.g. "CH1"
  inputType TaskInputType @default(NONE)

  itemFeedId          String?
  itemFeed            ItemFeed? @relation(fields: [itemFeedId], references: [id], onDelete: SetNull)
  fireIntervalSeconds Int?      // only meaningful when inputType = ITEM_FEED — set by Part 2

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([taskId, channelId])
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
  flowLinks FlowLink[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Remove `Device.workflowId`/`Device.workflow` entirely** — a Device relates to its Workflow through `Task` now (`device.task?.workflow`). Update:
- `lib/deviceState.ts`'s `getDeviceState()` — same Off/Active/Automated/Problem logic, just re-pointed to `device.task?.workflow?.status` instead of `device.workflow?.status`.
- Any query that used to `include: { workflow: true }` on `Device` needs `include: { task: { include: { workflow: true } } }` instead — grep for `.workflow` usages on `Device` (routes, `DeviceConfigModal.tsx`'s workflow select, the Devices list, `LocationMapCard.tsx`'s read-only info panel) and update each.
- `DeviceConfigModal.tsx`'s existing Workflow select (populated from `GET /api/workflows`) — decide whether assigning a Workflow directly from the Device modal still makes sense now that the real relationship is via a Task, or whether that assignment should move to the (Part 2) canvas instead. If genuinely unclear, ask Luc rather than guessing — this is a real UX fork, not just a schema rename.

Migrate: `npx prisma migrate dev --name add_task_flowlink_and_workflow_automation_fields`.

**Re-seed, don't migrate data**: rewrite `prisma/seed-devices.mjs` (or a new seed script) so existing Device/Workflow fixtures get wrapped in `Task` rows (one Task per already-`workflowId`-attached Device, same Workflow) rather than attempting to carry old `Device.workflowId` values through the schema change — consistent with how BL-042 and BL-049 both simply rewrote and re-ran the seed script on their own schema changes.

No dedicated Task/FlowLink UI in this batch — CRUD API routes only (`app/api/tasks/...`, `app/api/flow-links/...`), enough for Part 2's canvas to call. Building the canvas itself is out of scope here.

### Verify

- `npm run build` passes; `npx prisma migrate dev` runs cleanly against the local dev DB.
- Every existing Devices/Overview page that used to read `device.workflow` still shows correct Automated/Problem coloring after the re-seed (spot-check at least one Device on each Workflow fixture).
- Item Feed CRUD round-trip for all three kinds (create/edit/delete), including the kind-specific validation (e.g. `FIXED` rejects an empty item list).
- `mintSerializedItems` — call it once live with `quantity: 1` against Luc's sandbox tenant, confirm a real hex EPC comes back, and confirm a call requesting e.g. `quantity: 50` actually gets clamped to 10 (check the raw request sent, not just the returned array length, in case the API itself would silently cap differently).
- `GET /stock` (Phase 3) — one live call against a real site/zone from the seeded fixtures, whatever auth combination ends up working.

### Conventions (same as every previous batch)

- Work on `staging`. Commit message(s) reference the BL numbers covered. `npm version minor --no-git-tag-version` (new features, no letter suffix) — one bump per commit, at the point you're ready to commit, not per individual model added.
- Record every live-API finding (Product API response shapes, Serialization API response shape, Inventory API auth/gateway) as dated additions to the relevant `CLAUDE-CONCEPT.md` section 7.x, the same way every previous API integration in this project has been corrected/extended after first real contact.
- If the Product API's "can it search/filter" question, or the `DeviceConfigModal`'s Workflow-select UX fork, turn out genuinely ambiguous once you're looking at it — ask Luc rather than guessing silently, per `CLAUDE.md`'s standing instruction.
- Separately, unrelated to this batch but worth flagging to Luc once you're in a normal conversation with him: BL-053's own completion note recorded that `heartbeatConfig`'s exact request shape is still unresolved (10+ shapes tried, all rejected) and the DataCollector API's YAML isn't in this project — that's still open and needs the schema from him, independent of this Item Feed/Task work.
