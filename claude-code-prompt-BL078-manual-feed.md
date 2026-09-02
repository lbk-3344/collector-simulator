# BL-078 — Manual feed: one-off send from a Ready Device

## Context

Full spec: `CLAUDE-CONCEPT.md` §15.11 (read it before starting — this prompt
summarizes it but the section has the complete reasoning behind every
judgment call below). `BACKLOG.md` "Manual feed" section has the one-line
version.

Direct request from Luc: a Device that's **Ready** (configured + published,
not currently in a running Workflow — 15.3) can be manually fed a one-off
batch from an Item Feed, on demand. This resolves the "manual data send —
coming soon" placeholder that's stood in for this since BL-046 (2026-08-28)
— section 15's own opening paragraph has said "the manual-send screen itself
is explicitly deferred" this whole time.

Two entry points, both already routing *somewhere* today:
1. **Overview map** — clicking a Ready Device marker (`app/(app)/LocationMapCard.tsx`, `handleDeviceClick`, around line 449) currently sets `manualSendDevice`, which renders a modal (~line 671) that branches on Offline vs. not-Offline and shows literal placeholder text `"Manual data send — coming soon."` for the not-Offline (i.e. Ready) case. **This is what gets replaced** — the Offline branch (its own copy, the offline-toggle footer button) stays exactly as-is.
2. **Devices list** (`app/(app)/devices/page.tsx`) — rows have **no click handler today**, only the four row-action icon buttons (Edit/Offline-toggle/Duplicate/Delete, around line 293-350) do anything. This needs new wiring, not a swap.

## The scoping decision — read this before writing any code

This is deliberately a **standalone one-off send, not a miniature Workflow
run**. Concretely:

- Reuse `resolveBatch()` (currently a module-private function in
  `lib/workflowRun.ts`, ~line 55) for real — export it, don't reimplement
  minting/stock-query/fixed-list logic. It already handles the `NEW` 10-item
  cap (`MAX_NEW_ITEMS_PER_FIRING`), `PRESENT`'s real stock query, and
  `FIXED`'s literal list. Signature: `resolveBatch(ownerId: string, feed: ItemFeed, creds: RunCredentials | null): Promise<ResolvedBatch>`.
- **Do not** create an `InFlightBatch` or evaluate the Device's Flow Links,
  even if it happens to have a Task attached (a Ready Device can be attached
  to a *stopped* Workflow — still Ready per 15.3). The manual send stops at
  the one Channel the user picked. Fan-out is what makes something an
  automated *run*; this feature is explicitly not that.
- **Do not** write a `SimulatedRead` row. That model's `workflowId`/`taskId`
  columns are required, non-nullable (`prisma/schema.prisma` ~line 313-326)
  — a manual feed usually has neither. Loosening that constraint is a real
  migration for what's meant to be a lightweight feature, and isn't part of
  this build. Visibility instead comes from two already-built surfaces: the
  real `POST /reads` call is already captured by `ApiCallLog`/`loggedFetch`
  (History page's "Endpoint calls" tab, §19), and once processed, the read
  shows up for real in the EPCIS-events tab (§7.9/§19). **This means items
  sent by a manual feed won't count toward the Overview "Items generated"
  KPI (14.4).** That's a known, accepted gap for this build — don't try to
  route around it by writing a partial/fake `SimulatedRead`; if it matters
  once Luc sees this, it's a follow-up (nullable `workflowId`/`taskId`,
  logged as `null`/`null`), not something to guess at now.
- Split `emitReadAndScheduleHops()` (`lib/workflowRun.ts`, ~line 111) into
  two pieces: keep its existing `SimulatedRead` + Flow-Link-fan-out behavior
  for the automated path exactly as-is, but pull the "push one read to the
  real platform" half (the `sendReads` call + `ReadPushStats` bookkeeping,
  ~line 133-149) into its own exported function so the new manual-feed route
  can call *that* directly without duplicating it. Something like:
  ```ts
  export async function pushReadToPlatform(args: {
    ownerId: string;
    creds: RunCredentials | null;
    collectorId: string | null;
    channelId: string;
    items: string[];
    at: Date;
  }): Promise<{ pushed: boolean; notProcessed: boolean; note?: string }>
  ```
  `emitReadAndScheduleHops` calls this internally instead of inlining the
  `sendReads` logic itself — same behavior, no automated-path regression,
  just de-duplicated.

## Task 1 — Server: `POST /api/devices/[id]/manual-feed`

New route, `app/api/devices/[id]/manual-feed/route.ts`. Body: `{ channelId: string; itemFeedId: string }`.

1. `getServerSession` — 401 if none.
2. Load the Device. 404 if not found or not visible (`visibilityWhere`,
   `lib/ownership.ts`). **403 if not owned** (`isOwner`) — this is a mutating
   real-world action, same rule as every other mutating route (§17.2), not
   the read-only visibility check alone.
3. Recompute `getDeviceState(device)` server-side and **409 unless it's
   `"READY"`** — don't trust the client's idea of the Device's state (it may
   be stale — e.g. someone else just started its Workflow).
4. Validate `channelId` is one of `device.channels`' `id`s — 400 otherwise.
5. Load the `ItemFeed` by `itemFeedId`. **404 unless `ownerId === session.user.id`**
   — deliberately *not* `visibilityWhere` (owned-or-shared) here; see §15.11's
   reasoning (mirrors §17.3's existing cross-owner composition rule — a
   shared-to-you feed must be duplicated into your own library first via the
   existing Item Feeds list Duplicate action, same as attaching one to a
   Workflow canvas already requires).
6. Resolve the caller's own Bartender credentials the same way the History
   page's EPCIS route does it (`app/api/history/epcis/route.ts` for the
   pattern) — `getUserBartenderCredentials(session.user.id)` from
   `lib/bartenderLocations.ts` (the `apikey`-header credential, same shape as
   `RunCredentials`). `null` if unset — `resolveBatch`/`pushReadToPlatform`
   both already handle a null-creds case gracefully (a `note` explaining
   there's no Bartender connection), so don't hard-block the request on it —
   let the resolve step surface that as this firing's result instead, same
   as the automated engine does today.
7. `const batch = await resolveBatch(session.user.id, itemFeed, creds)`.
8. If `batch.items.length > 0`, call the new `pushReadToPlatform` helper
   (only meaningful when `device.publishedAt` and `device.collectorId` are
   both set — which they always are for a Ready device, so this is really
   just "did the push succeed").
9. Return a plain summary for the modal to render — item count, the note (if
   any resolve/push failure), and whether the push happened. Something like
   `{ itemsResolved: number; pushed: boolean; note: string | null }`. No
   need to return the actual EPCs — the modal doesn't need to list them, and
   `NEW`-minted EPCs are already visible via the EPCIS tab if someone wants
   to look them up.

No new Prisma model, no migration.

## Task 2 — `components/ManualFeedModal.tsx`

New component, structural pattern from `BugReportModal.tsx` /
`DeviceConfigModal.tsx` (centered `.modal-overlay` > `.modal.fade-in`,
`.modal-head`/`.modal-body`/`.modal-foot`, same close-button SVG markup
already used everywhere else in this app — copy it, don't reinvent).

Props roughly: `{ device: DeviceRecord; onClose: () => void }`.

Contents:
- Header: device name + collector id (same line style as the existing
  manual-send placeholder's `<p className="note">`), a small Ready-state
  pill if one's cheap to reuse from the existing state-dot markup.
- **Channel picker** — a `<select>` of `device.channels` (id + name-or-id
  label, e.g. "CH1" or "CH1 — Entry sensor" when `name` is set). Pre-select
  the first/only one; only show the picker at all when there's more than
  one Channel (the common case is exactly one, per 15.1's default).
- **Item Feed list** — fetch `GET /api/item-feeds?mine=1` (see Task 3 below
  for the query-param addition). Render each as a selectable row: name, a
  kind badge (`NEW`/`"In stock"` for `PRESENT`/`FIXED` — reuse the existing
  display-label convention, §13's 2026-08-31 bug-batch note), and a
  one-line description built from the feed's own fields (GTIN count for
  NEW, zone+match-mode for PRESENT, item count for FIXED). Selecting a row
  shows the matching per-kind info text underneath — reuse the exact
  strings already defined in `components/ItemFeedForm.tsx`'s `KINDS` array
  rather than rewriting them (import or copy verbatim, your call, but don't
  let the two texts drift).
  - Each row gets a small ghost "Duplicate" icon button (same icon/pattern
    as `app/(app)/devices/page.tsx`'s `DuplicateIcon` / the Item Feeds
    list's own Duplicate button) calling `POST /api/item-feeds/[id]/duplicate`
    — on success, re-fetch/prepend the new "(Copy)" feed into this same list
    (don't auto-select it; let the user pick it explicitly).
  - A **"+ New feed"** action at the top or bottom of the list opens
    `ItemFeedForm` inline within this modal (`<ItemFeedForm feed={null} onSaved={...} onCancel={...} />`
    — it's already a self-contained form component, no adaptation needed
    beyond handling `onSaved` by adding the new feed to this list and
    selecting it, and `onCancel` by returning to the list view).
- **Footer**: "Close" (secondary) + **"Send now"** (primary), disabled until
  both a Channel and an Item Feed are selected, and while a send is
  in-flight. On click: `POST` to the Task 1 route, then render the result
  inline in the modal body (e.g. a `.snack`/`.note` line — "3 items sent" /
  "0 items — nothing in stock in that zone" / the failure note) **without
  closing the modal**, so the user can immediately fire again (same feed,
  a different one, or a different Channel) — this is meant to feel like a
  quick repeatable action, not a one-shot dialog.

No live token/animation needed (this app already deferred that for the
Workflow canvas itself, 16.4) — a plain result line is enough, consistent
with how `runTick()`'s own results are surfaced (a summary, not a visual).

## Task 3 — `GET /api/item-feeds?mine=1`

Small addition to the existing route (`app/api/item-feeds/route.ts`). When
`?mine=1` (or however you want to spell it — `owner=me` also fine, your
call, just document whichever in the route's own comment) is present, use
`where: { ownerId: session.user.id }` instead of the existing
`visibilityWhere(session.user.id)`. Keep the default (no query param)
behavior exactly as it is today for every other caller of this route (the
Item Feeds library page).

## Task 4 — Wire the map

`app/(app)/LocationMapCard.tsx`: the existing `manualSendDevice` modal
(~line 671) currently renders one modal for both Ready and Offline, branching
on `isOffline`. Split it: keep the Offline branch's existing markup and
`handleOfflineToggle` footer exactly as-is; replace the Ready branch's body
(currently just the "coming soon" `<p>`) with `<ManualFeedModal device={manualSendDevice} onClose={() => setManualSendDevice(null)} />`. No change needed to `handleDeviceClick`'s routing itself (READY/OFFLINE already both set `manualSendDevice` — that's still correct, the two states just render different content once there).

## Task 5 — Wire the Devices list

`app/(app)/devices/page.tsx`: add an `onClick` to each `<tr>` (~line 293)
that routes by `getDeviceState(device)` the same way `LocationMapCard.tsx`'s
`handleDeviceClick` already does — **this mirrors the map's existing
per-state routing table** (see §15.11's second flagged judgment call: rather
than only wiring up the Ready case Luc literally described, every row gets
consistent click behavior):

- `readOnly` (shared-not-owned, same check already computed in this file for
  the row-action buttons) → the same read-only config modal the Edit button
  already opens (`setConfigModal({ device, readOnly: true, ... })`).
- `PENDING` → `setConfigModal({ device, lockTypeAndSite: true, deleteOnCancelIfUnsaved: false })`.
- `READY` → open `ManualFeedModal` (new local state, e.g. `manualFeedDevice`).
- `ACTIVE` → whatever this page's equivalent of the map's read-only info
  panel is — if this page has no such panel today, the simplest option is
  reusing `setConfigModal({ device, readOnly: true })` for Active too (view
  without edit), flagged here since the map's dedicated read-only *info*
  panel (device fields + workflow name/status, no config-form styling) isn't
  something this page currently has an equivalent of — build a matching one
  only if it's a small lift, otherwise the config-modal-in-read-only-mode
  fallback is an acceptable v1 substitute.
- `OFFLINE` → the existing offline-toggle modal/action this page already has
  for its row Offline-toggle button — reuse whatever state/handler backs
  that today rather than building a second copy.

**Every existing row-action button (Edit/Offline-toggle/Duplicate/Delete)
needs `e.stopPropagation()` added to its `onClick`** so clicking one doesn't
also fire the new row click underneath it.

## Docs

`CLAUDE-CONCEPT.md` §15.11 and the `BACKLOG.md` "Manual feed" section are
already written (this Cowork session wrote them ahead of this prompt) —
update `BACKLOG.md`'s `BL-078` line to `[x]` with a completion note once
built (mirror the style of the other recent completion notes — what got
built, any real deviation from this prompt, and the verification below).
No `CHARTE-GRAPHIQUE.md` change expected unless the modal introduces a
visual pattern genuinely novel enough to need one (it shouldn't — it's
built entirely from existing modal/form/icon patterns).

## Versioning

New feature, no letter suffix → `npm version minor --no-git-tag-version`.

## Verification

- `npx tsc --noEmit` at minimum, a real `npm run build` if it runs clean in
  your environment.
- Live-verify against the sandbox tenant, at least once each: a `NEW` feed
  (mints for real, capped at 10, shows up in the EPCIS tab afterward), a
  `PRESENT` feed (real stock query, including the empty-zone case), a
  `FIXED` feed. Confirm the manual send does **not** create a
  `SimulatedRead` row and does **not** advance anything on a Workflow this
  Device happens to be attached to (attach it to a stopped Workflow with an
  outgoing Flow Link first, fire a manual feed, confirm no `InFlightBatch`
  was created).
- Confirm the 403/409 gates: a shared-not-owned Device, a Device that isn't
  Ready (e.g. Active), a `channelId` that isn't one of the Device's own.
- Browser-verify both entry points: the map's Ready-marker click, and the
  new Devices-list row click across a few different states, confirming the
  action-icon buttons still work without also opening the row's modal.
