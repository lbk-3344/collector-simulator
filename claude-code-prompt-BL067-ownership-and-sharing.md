## Task: Per-user workspace ownership + admin-controlled sharing — BL-067 (Part 1 of 2)

Direct request from Luc, 2026-08-31, flagging a real gap: "each user should have a separate workspace: their settings, their device, their feeds and workflow. It should not be shared across users unless explicitly stated as shared, and only can be done by the administrator." Confirmed by inspecting every `findMany` in `app/api/devices`, `app/api/workflows`, `app/api/item-feeds`: **none of them filter by user at all** — every logged-in user has always seen and edited the exact same shared pool of Devices, Workflows, and Item Feeds. Settings (Bartender Connection credentials, `selectedLocationCode`) are already correctly scoped to `session.user.id` — no change needed there, don't touch `app/api/settings/*`.

Full spec: `CLAUDE-CONCEPT.md` section 17 (all six subsections), section 13's 2026-08-31 (later still) decision-log entry. Backlog: `BACKLOG.md` "Per-user workspaces & admin-controlled sharing" — BL-067/068/069, this prompt covers BL-067 only.

**This is Part 1 of 2 — Part 2 (`claude-code-prompt-BL068-069-sharing-ui.md`) depends on this one being merged first** (the `ownerId`/`shared` fields, the visibility/edit enforcement, and the share-toggle route all need to exist before any UI can be built on top of them).

### Important framing before you start

- **Four things below were explicitly confirmed with Luc, not inferred — build exactly these, don't substitute a "more standard" multi-tenancy pattern:**
  1. A shared resource is visible to **everyone**, not a hand-picked subset of users.
  2. Shared means **read-only** for everyone except the owner — never co-editable.
  3. Every existing Device/Workflow/Item Feed row (there is no ownership today) gets backfilled to **one account — Luc's** — as part of the migration, none pre-marked `shared`.
  4. **Admins do not get blanket visibility into other users' workspaces in the normal app UI.** The Devices list, Workflows list, Item Feeds list, Overview map, and Workflow canvas apply the exact same `ownerId === me OR shared === true` filter to an `ADMIN` session as to a `USER` session — no exception. The *only* place an admin's query is allowed to cross owners is the new admin-only "Shared resources" screen (Part 2), and even that screen only lists+toggles, it doesn't expose the underlying config for editing.
- **`Task`, `FeedNode`, `FeedLink`, `FlowLink` do not get their own `ownerId`.** Each already belongs to exactly one `Workflow` (`workflowId`) — they inherit ownership/sharing from `workflow.ownerId`/`workflow.shared`. Don't add `ownerId` to these four tables.
- **A Workflow may only attach a Device or Item Feed it shares an owner with — even if that Device/Item Feed is `shared`.** Sharing grants read-only visibility of the thing itself, not the right to wire it into someone else's Workflow graph. This is a deliberate v1 simplification (see `CLAUDE-CONCEPT.md` 17.3) — the escape hatch is cloning a shared Device into your own workspace first (already built, BL-065/066), not cross-owner composition.
- **`ownerId` is always server-derived from the session, never client-supplied**, on every create route touched below.

### Phase 1 — Schema

Add to `prisma/schema.prisma`:

```prisma
model Device {
  // ...existing fields...
  ownerId String
  owner   User    @relation("OwnedDevices", fields: [ownerId], references: [id], onDelete: Cascade)
  shared  Boolean @default(false)
}

model Workflow {
  // ...existing fields...
  ownerId String
  owner   User    @relation("OwnedWorkflows", fields: [ownerId], references: [id], onDelete: Cascade)
  shared  Boolean @default(false)
}

model ItemFeed {
  // ...existing fields...
  ownerId String
  owner   User    @relation("OwnedItemFeeds", fields: [ownerId], references: [id], onDelete: Cascade)
  shared  Boolean @default(false)
}
```

On `User`, add the three back-relations (named, since `User` already has other relations — `bugReports` etc. — and each of these needs a distinct relation name):

```prisma
ownedDevices   Device[]   @relation("OwnedDevices")
ownedWorkflows Workflow[] @relation("OwnedWorkflows")
ownedItemFeeds ItemFeed[] @relation("OwnedItemFeeds")
```

Don't add `ownerId`/`shared` to `Task`, `FeedNode`, `FeedLink`, or `FlowLink`.

**Migration is two steps, not one** — `ownerId` is required (`NOT NULL`), but existing rows have nothing to put there yet:
1. Add the columns as **nullable** first (`ownerId String?`), migrate.
2. Write a one-off backfill (a small script under `scripts/`, or a raw SQL step in the migration itself — your call) that sets `ownerId` on every existing `Device`/`Workflow`/`ItemFeed` row to a single account: **the seeded bootstrap admin** — check `.env`'s `INITIAL_ADMIN_EMAILS` (per `BACKLOG.md` BL-005, this was `lbellissard@seagullsoftware.com` at setup time) against the actual `User` table in the target database first. If Luc's real day-to-day sign-in in that database is a *different* email (e.g. a `luc.bellissard@gmail.com`-style Google account), **stop and ask him which account should end up owning everything** rather than guessing — this is a one-way backfill against real `staging`/production data, not something to redo casually. `shared` can be left at its `false` default for every row (already the column default).
3. Once every row has an `ownerId`, alter the column to `NOT NULL` in a second migration, and update the Prisma schema field back to `ownerId String` (non-optional).

Run against local dev DB first (`npx prisma migrate dev --name add_workspace_ownership`), confirm the backfill script works there, before touching `staging`'s real database.

### Phase 2 — Visibility + edit enforcement across every existing route

Add a small shared helper, e.g. `lib/ownership.ts`:

```typescript
// A resource is visible to a user if they own it or it's shared.
export function visibilityWhere(userId: string) {
  return { OR: [{ ownerId: userId }, { shared: true }] };
}

// Only the owner may mutate — shared is always read-only to everyone else,
// admins included, in the normal app surface (CLAUDE-CONCEPT.md 17.2/17.4).
export function assertOwner<T extends { ownerId: string }>(record: T, userId: string): boolean {
  return record.ownerId === userId;
}
```

Apply across every route below. In each case: list/GET-many gets `visibilityWhere` in its `where` (combined with any existing filter, e.g. `locationCode` on Devices, `workflowId` on Tasks — via `AND: [...]`). GET-one checks visibility and returns **404** (not 403 — don't confirm to a non-owner, non-shared-viewer that the id even exists) if it fails. Every mutating verb (PATCH/DELETE/POST-as-action like Publish or Duplicate or Run/Stop) checks `assertOwner` after loading the record and returns **403** if it fails, before doing anything else.

- **`app/api/devices/route.ts`**: `GET` — add `visibilityWhere(session.user.id)` (keep the existing optional `locationCode` filter, combine with `AND`). `POST` — set `ownerId: session.user.id` on create, both the shell-create and full-config-create branches.
- **`app/api/devices/[id]/route.ts`**: `GET`/`PATCH`/`DELETE` — visibility check then owner check per the pattern above. The Publish flow (inside `PATCH`, per section 15.8) is a mutation — owner-only, same as any other `PATCH`.
- **`app/api/devices/[id]/duplicate/route.ts`** (BL-065): the *source* device only needs the visibility check (you can duplicate something shared with you — that's the escape hatch from 17.3 — but see below), not ownership; the **new clone's `ownerId` is always `session.user.id`**, regardless of who owned the source. This is the one intentional place where cloning a shared (not-owned) record is allowed and expected — it's how a user brings a shared Device into their own workspace.
- **`app/api/devices/suggest-code/route.ts`**: unaffected — it only counts, doesn't expose records.
- **`app/api/workflows/route.ts`**: `GET` — add `visibilityWhere`. `POST` — set `ownerId: session.user.id`.
- **`app/api/workflows/[id]/route.ts`** and **`app/api/workflows/[id]/reads/route.ts`**: visibility check on GET, owner check on PATCH/DELETE and on the Run/Stop status flip.
- **`app/api/item-feeds/route.ts`**: `GET` — add `visibilityWhere`. `POST` — set `ownerId: session.user.id`.
- **`app/api/item-feeds/[id]/route.ts`**: visibility check on GET, owner check on PATCH/DELETE.
- **`app/api/tasks/route.ts`**: `GET` (filtered by `workflowId`) — join through `workflow` and apply `visibilityWhere` to it (`where: { workflowId, workflow: visibilityWhere(session.user.id) }`). `POST` — after loading `workflow` and `device` (already done in this route, just also `select: { ownerId: true, shared: true }` on both): (a) the caller must own the `workflow` (403 otherwise — you can't add a Task to a Workflow you don't own, full stop, shared-or-not); (b) the caller must own the `device` too — you can only attach your own Devices; (c) **`workflow.ownerId` must equal `device.ownerId`** (this is really implied by (a)+(b) since both must equal `session.user.id`, but assert it explicitly with a clear error message — "Devices and Workflows must belong to the same owner" — so the failure mode is legible if the logic above ever changes).
- **`app/api/tasks/[id]/route.ts`**: visibility via the parent `workflow`, owner check (via `workflow.ownerId`) on PATCH/DELETE.
- **`app/api/feed-nodes/route.ts`**: same shape as `tasks/route.ts` — `POST` needs `workflow.ownerId === itemFeed.ownerId === session.user.id`, same three-part check.
- **`app/api/feed-nodes/[id]/route.ts`**, **`app/api/feed-links/route.ts`** + **`[id]/route.ts`**, **`app/api/flow-links/route.ts`** + **`[id]/route.ts`**: all visibility/ownership via their parent `workflow.ownerId`/`workflow.shared` — no direct `ownerId` field on any of these four models (Phase 1). `feed-links`/`flow-links` creation should also confirm the `Task`(s)/`FeedNode` they connect belong to the *same* Workflow they're being created under (if that check doesn't already exist — check before assuming).
- **`app/api/workflows/[id]/reads/route.ts`** and any cron/tick route (`GET /api/cron/workflow-tick`, BL-061) that processes `RUNNING` Workflows: **no change to the tick logic's own reach** — it's a server-side job, not a per-user request, so it should keep processing every `RUNNING` Workflow regardless of owner (a scheduled Workflow must keep firing for its owner even though no one's "in session" — that's the entire point of BL-061's server-side scheduler). Just don't let a *user-facing* route leak cross-owner data while doing so.

### Phase 3 — Admin sharing-toggle route

New route, `app/api/{devices,workflows,item-feeds}/[id]/share/route.ts` (three small routes, or one shared handler parameterized by model — your call, but keep the three URL shapes so Part 2's UI can call them uniformly):

```typescript
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body?.shared !== "boolean") {
    return NextResponse.json({ error: "shared (boolean) is required" }, { status: 400 });
  }
  // No ownerId/visibility check here — this is the one deliberate admin-only
  // cross-owner action (CLAUDE-CONCEPT.md 17.4). Anyone who isn't ADMIN gets
  // the 403 above regardless of whether they own the record.
  const updated = await prisma.device.update({ where: { id: params.id }, data: { shared: body.shared } });
  return NextResponse.json({ device: updated });
}
```

(Same shape for `workflow`/`itemFeed`.) This is intentionally the **only** place in the whole app where a mutation is allowed on a record the caller doesn't own — gated purely on `role === "ADMIN"`, per Luc's explicit "only can be done by the administrator."

### Phase 4 — Admin-only cross-owner listing endpoint (for Part 2's screen)

New route, `app/api/admin/shared-resources/route.ts`:

```typescript
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const [devices, workflows, itemFeeds] = await Promise.all([
    prisma.device.findMany({ select: { id: true, name: true, shared: true, owner: { select: { id: true, name: true, email: true } } }, orderBy: { name: "asc" } }),
    prisma.workflow.findMany({ select: { id: true, name: true, shared: true, owner: { select: { id: true, name: true, email: true } } }, orderBy: { name: "asc" } }),
    prisma.itemFeed.findMany({ select: { id: true, name: true, shared: true, owner: { select: { id: true, name: true, email: true } } }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ devices, workflows, itemFeeds });
}
```

No visibility filter at all here — this is the one deliberate cross-owner query (17.4), gated purely on `role === "ADMIN"`. Don't reuse this route or its unfiltered query pattern anywhere else.

### Verify

- `npm run build` passes; both migration steps run cleanly against the local dev DB (nullable-add → backfill → not-null).
- Two different `USER` accounts: confirm each sees only their own Devices/Workflows/Item Feeds on every list route — create one as user A, confirm user B's `GET` doesn't include it.
- Mark one of user A's Devices `shared: true` (direct DB edit or, once Phase 3 exists, via the route as an `ADMIN` session) — confirm user B's `GET /api/devices` now includes it, `GET /api/devices/[id]` returns it, but `PATCH`/`DELETE`/Publish on it from user B's session all 403.
- Confirm an `ADMIN` session's `GET /api/devices` (the normal route, not Phase 4's) is **still filtered** to that admin's own `ownerId === me OR shared` — not everything. This is the one behavior most likely to get built wrong by habit (most apps give admins a bypass on list queries) — explicitly re-check it.
- Confirm `POST /api/tasks` 403s when the Workflow and Device have different owners, even when the Device is `shared: true`.
- Confirm `POST /api/devices/[id]/duplicate` on a shared-not-owned source device succeeds, and the resulting clone's `ownerId` is the caller's own id, not the source's.
- Confirm the backfill: every pre-existing Device/Workflow/Item Feed row now has `ownerId` set to the agreed account and `shared: false`.
- Confirm the scheduled tick route (`workflow-tick`/`reads`) still processes every `RUNNING` Workflow regardless of owner — a shared or not-shared Workflow that's `RUNNING` keeps firing on schedule either way; ownership only gates the *user-facing* API, never the background job.

### Conventions (same as every previous batch)

- Work on `staging`. Commit message(s) reference BL-067. `npm version minor --no-git-tag-version`.
- If the admin-account question in Phase 1 step 2 doesn't resolve cleanly from the real database, stop and ask Luc rather than guessing — this backfill runs once, against real data.
- If anything about the three-part same-owner check on `tasks`/`feed-nodes` creation turns out to already partially exist (e.g. a Device-already-attached check) — extend it, don't duplicate a second validation path alongside it.
