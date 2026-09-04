# BL-079 — Hide a shared resource from your own view

## Context

Full spec: `CLAUDE-CONCEPT.md` §17.7 (read it first — this prompt is the
build checklist, the section has the full reasoning). `BACKLOG.md` "Hide
shared resources" section has the short version.

Direct request from Luc: a user can permanently remove a shared Device, Item
Feed, or Workflow from their own screen. **"Permanent" was confirmed
directly with him** (not assumed): it means durable across sessions/logins
— not a client-side dismiss that comes back on reload — but it's not a dead
end either. A new **Settings → Hidden items** tab (not admin-gated, separate
from the existing ADMIN-only "Shared resources" tab) lets the user restore
anything they've hidden.

This only ever applies to a resource that's **shared and not owned** by the
caller — an owner already has Delete for their own rows. It never touches
the resource's own `shared` flag (§17.4, admin-only, global) and never
affects any other user's view.

## Task 1 — Schema: three small join tables, not one polymorphic table

Add to `prisma/schema.prisma`, matching this app's existing style (real
typed relations, not a loose string+enum pair):

```prisma
model HiddenDevice {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceId  String
  device    Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@unique([userId, deviceId])
}

model HiddenWorkflow {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  @@unique([userId, workflowId])
}

model HiddenItemFeed {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  itemFeedId String
  itemFeed   ItemFeed @relation(fields: [itemFeedId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  @@unique([userId, itemFeedId])
}
```

Add the matching back-relations: `User` gets `hiddenDevices HiddenDevice[]`
/ `hiddenWorkflows HiddenWorkflow[]` / `hiddenItemFeeds HiddenItemFeed[]`
(name these however reads best — they're not referenced by name elsewhere).
`Device`/`Workflow`/`ItemFeed` each get **one relation named `hiddenBy`**
(`hiddenBy HiddenDevice[]` etc.) — keep this name consistent across all
three models, it's what the visibility filter below reads through.

`npx prisma migrate dev --name add_hidden_resources`.

## Task 2 — Visibility filter

`lib/ownership.ts`'s `visibilityWhere(userId)` currently returns:

```ts
{ OR: [{ ownerId: userId }, { shared: true }] }
```

Add the hide condition **only to the shared branch** — an owned row is
never affected, hiding your own isn't a thing here:

```ts
{ OR: [
  { ownerId: userId },
  { shared: true, hiddenBy: { none: { userId } } },
] }
```

If TypeScript's structural typing doesn't let one shared function satisfy
`Prisma.DeviceWhereInput` / `WorkflowWhereInput` / `ItemFeedWhereInput`
simultaneously (likely, since Prisma generates a distinct relation-filter
type per relation even when they're shaped the same), split into three thin
wrappers instead (`deviceVisibilityWhere` / `workflowVisibilityWhere` /
`itemFeedVisibilityWhere`, each just this same object literal) rather than
fighting the type system — implementation detail, not a product decision,
your call which reads cleaner in this codebase.

Every existing call site of `visibilityWhere` (list/GET-one routes across
`app/api/{devices,workflows,item-feeds}`, per §17.2) picks this up
automatically once the function's return shape changes — no call-site
changes needed beyond swapping in the split wrappers if you go that route.

**Do not** touch `isOwner()` or any mutating route's ownership check — hiding
is purely additive to the read-side visibility filter.

## Task 3 — Hide / unhide routes

One pair per resource type, same shape each time. Example for Devices,
`app/api/devices/[id]/hide/route.ts`:

- `POST` — hide it.
  1. `getServerSession` — 401 if none.
  2. Load the Device with the *old* (pre-hide) `visibilityWhere` check —
     404 if not visible at all (not owned, not shared).
  3. **404 (not 400) if `device.ownerId === session.user.id`** — same
     "don't distinguish the failure reason" posture as the rest of §17.2;
     hiding your own resource isn't a supported action, and there's no
     reason to tell an owner-caller anything more specific than "not
     found" here either.
  4. Upsert a `HiddenDevice` row (`userId`, `deviceId`) — use `upsert` or
     catch the unique-constraint conflict so calling this twice is a no-op,
     not an error.
- `DELETE` (or `POST` to a sibling `.../unhide` route — your call, pick
  whichever this codebase's existing REST conventions favor; the History/
  Devices routes in this app lean toward verb-named sibling routes for
  non-CRUD actions like `/publish`, `/duplicate`, so a `.../unhide` POST
  route probably fits best) — delete the `HiddenDevice` row for
  `(session.user.id, deviceId)` if one exists. No error if there wasn't one
  to remove.

Repeat identically for `app/api/workflows/[id]/hide` (`HiddenWorkflow`) and
`app/api/item-feeds/[id]/hide` (`HiddenItemFeed`). A small shared helper
(e.g. in `lib/ownership.ts` or a new `lib/hiddenResources.ts`) is worth
factoring out once you see how similar the three route bodies are — your
call on the exact shape.

## Task 4 — `GET /api/hidden-resources`

New route, mirrors `app/api/admin/shared-resources/route.ts`'s shape (same
`Promise.all` of three `findMany`s, same `{ devices, workflows, itemFeeds }`
response shape) but:
- **Not admin-gated** — any logged-in user (401 only if no session).
- Filtered to `where: { hiddenBy: { some: { userId: session.user.id } } }`
  on each of the three models, instead of the admin route's unfiltered
  cross-owner query.
- Include the `owner` select (`{ id, name, email }`) same as the admin
  route, so the UI can show who each hidden item actually belongs to.

## Task 5 — UI: the hide action on the three list pages

Same treatment on all three — `app/(app)/devices/page.tsx`,
`app/(app)/item-feeds/page.tsx`, `app/(app)/workflows/page.tsx`. Each
already computes a `readOnly` boolean per row (`ownerId !== currentUserId`)
and disables that row's Delete button when `readOnly`. Add a **new** row-
action icon button, shown/enabled **only when `readOnly` is true** (the
inverse of Delete — Delete is for owned rows, this is for shared-not-owned
ones), in the same `row-actions` group. Something like an eye-slash icon,
label "Remove from my view" / title "Remove this shared item from your
view — you can restore it later from Settings".

On click: a confirm (`confirm()`, matching this app's existing pattern for
destructive-ish actions, e.g. the Devices list's own Delete/Duplicate
confirms) — wording should make clear it's reversible, e.g. *"Remove this
shared Device from your view? You can bring it back later from Settings →
Hidden items."* — then `POST` the hide route, and on success remove the row
from local state immediately (same optimistic-update pattern already used
for Delete/Duplicate on these pages) rather than waiting for a full reload.

**Workflows list note**: its `<tr>` already has an `onClick` that navigates
to `/workflows/[id]`, with the whole actions `<td>` wrapped in
`onClick={(e) => e.stopPropagation()}` to keep the row nav from firing when
a row-action button is clicked — the new hide button just needs to live
inside that same `<td>`, no extra wiring needed there.

**Devices list note**: BL-078 added a row `onClick` here too (routes by
device state to open various modals) — the new hide button needs its own
`e.stopPropagation()` on its `onClick` (matching the pattern BL-078 already
added to the other row-action buttons on this page) so clicking it doesn't
also trigger the row's own click handler underneath it.

## Task 6 — `components/HiddenResourcesTable.tsx` + Settings tab

New component, same visual shape as the existing `components/SharedResourcesTable.tsx`
(`Kind`/`KIND_LABEL`/`KIND_CHIP`/`FEED_KIND_LABEL` — reuse those constants,
either by exporting them from `SharedResourcesTable.tsx` or duplicating the
small maps, your call) — type chip, name, owner (name + email) — but:
- Fetches `GET /api/hidden-resources` (Task 4), not the admin cross-owner
  route.
- Each row gets a **Restore** button instead of a shared toggle — calls the
  Task 3 unhide route for that resource's type, then removes the row from
  local state on success.
- Empty state: something like "Nothing hidden — shared items you remove
  from your view will show up here."

Wire it into `app/(app)/settings/SettingsTabs.tsx` as a new tab, e.g.
`"hidden"` alongside the existing `Tab` union — **not gated by `isAdmin`**
(every tab currently gated by `isAdmin && tab === "..."` stays as-is; this
new one renders unconditionally for any logged-in user, same as the
existing `"bartender"` tab). Label it "Hidden items" in the tab bar,
positioned wherever reads best — probably right after "Bartender
Connection" since both are personal/non-admin tabs, ahead of the
admin-only ones.

## Docs

`CLAUDE-CONCEPT.md` §17.7 and the `BACKLOG.md` "Hide shared resources"
section are already written — update `BL-079` to `[x]` with a completion
note once built, same style as the other recent entries (what got built,
any deviation from this prompt, verification done).

## Versioning

New feature, no letter suffix → `npm version minor --no-git-tag-version`.

## Verification

- `npx tsc --noEmit` at minimum, a real `npm run build` if it runs clean.
- Live-verify: as a non-owner with a shared Device/Workflow/Item Feed
  visible, hide each of the three, confirm they disappear from their
  respective list **and** the Overview map / Workflow canvas (wherever
  applicable) without a page reload needed on the list itself, and stay
  gone after a real page reload / re-login. Confirm the owner's own view is
  completely unaffected (they still see it, `shared` flag untouched).
  Restore each from Settings → Hidden items and confirm it reappears
  everywhere again.
- Confirm the 404 gates: hiding a resource you own, hiding one that's
  neither owned nor shared (should already 404 via the pre-existing
  visibility check), hiding the same resource twice (no-op, not an error).
- Confirm an admin toggling `shared` off then back on does **not** clear an
  existing hide — the user who hid it still doesn't see it afterward.
