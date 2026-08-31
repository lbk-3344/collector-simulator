## Task: Ownership/sharing UI — list badges, read-only canvas, admin screen — BL-068, BL-069 (Part 2 of 2)

Direct request from Luc, 2026-08-31 — see `claude-code-prompt-BL067-ownership-and-sharing.md` (Part 1) for the full framing. This batch is UI only: the "Shared" badge + disabled controls on shared-not-owned rows/nodes (BL-068), and a new admin-only "Shared resources" screen (BL-069).

Full spec: `CLAUDE-CONCEPT.md` section 17, `CHARTE-GRAPHIQUE.md` "'Shared' badge (read-only indicator)" and "Admin 'Shared resources' screen" (both added 2026-08-31). Backlog: `BACKLOG.md` BL-068/BL-069.

**This is Part 2 of 2 — depends on Part 1 (`claude-code-prompt-BL067-ownership-and-sharing.md`) being merged first.** It needs `Device`/`Workflow`/`ItemFeed`'s `ownerId`/`shared` fields, every list route's visibility filtering, every mutating route's owner enforcement, the three `.../[id]/share` routes, and `GET /api/admin/shared-resources` to already exist and work. Don't start this batch until Part 1 is on `staging`.

### Important framing before you start

- **A shared-not-owned row/node is read-only, not hidden.** The point of the "Shared" badge is to make that legible — a user should be able to see something exists and understand why they can't touch it, not wonder why an Edit button vanished. Disable, don't remove, the relevant controls.
- **Every API call from these disabled controls would already 403 server-side (Part 1)** — this batch is about not offering the action in the first place, as a UX courtesy, not as the actual security boundary. Don't skip Part 1's server-side checks on the assumption that a disabled button is enough.
- **The admin "Shared resources" screen is a sharing-management console only.** It lists across every user (the one deliberate cross-owner view in the app) and toggles `shared` — it does **not** let an admin open, edit, or delete the underlying Device config, Workflow canvas, or Item Feed. Don't wire row-click-through to anything.
- Client-side, "is this row mine?" is just `record.ownerId === session.user.id` — every list route already returns `ownerId` (Part 1 added the column; make sure each route's response actually includes it, since some `select`/`include` blocks might need `ownerId` added explicitly if they were narrowed before).

### Phase 1 — "Shared" badge + disabled controls, Devices list

`app/(app)/devices/page.tsx`:
- Need the current session's `user.id` client-side (check how other client components in this app get it — likely `useSession()` from `next-auth/react`, or it's passed down as a prop from a server component parent; match whatever pattern `LocationMapCard.tsx`/`OverviewClient.tsx` or this page's own parent already uses, don't introduce a second pattern).
- A row where `device.ownerId !== currentUserId` gets a `.chip-shared` badge (closed-padlock icon + "Shared" label, per `CHARTE-GRAPHIQUE.md`) next to the Name, and its Edit/Delete/Duplicate row-icon buttons rendered `disabled` at 40% opacity (existing disabled-button convention) rather than removed.

### Phase 2 — "Shared" badge + disabled controls, Workflows list and Item Feeds list

Same treatment on whichever list components back `/workflows` and `/item-feeds` (find them — likely `app/(app)/workflows/page.tsx` and `app/(app)/item-feeds/page.tsx`, or similarly named). Badge next to Name, row actions (Edit/Delete/Run-Stop-toggle/whatever exists per row) disabled on non-owned-shared rows.

### Phase 3 — Read-only Overview map for a shared Device

`app/(app)/LocationMapCard.tsx`: a marker for a Device where `device.ownerId !== currentUserId` (i.e. visible only because `shared: true`) should, while Edit mode is on:
- Not be draggable (no reposition).
- Not open the config modal on click.
- Not show the BL-066 right-click context menu at all (Copy/Paste/Duplicate should still work on a shared device via the "clone it into your own workspace" path from `CLAUDE-CONCEPT.md` 17.3 — **Duplicate is the one action that should stay enabled** on a shared marker, since duplicating creates a new self-owned copy rather than mutating the original; Copy should also stay enabled for the same reason, since copying to a clipboard doesn't mutate anything either. **Paste** stays governed by whatever's in the clipboard, unaffected by this. Only actions that would *mutate the shared record itself* — reposition-drag and the config-modal click — are disabled).
- Get a small `.chip-shared` badge near the marker (exact placement your call — a corner overlay on the icon, or beside the `ReadPointIcon` — keep it legible at the map's smallest practical zoom).

Outside Edit mode, the existing non-Edit-mode click behavior (15.6) already only *reads* — Active→manual-send-placeholder, Automated/Problem→read-only info panel, Off→config modal. That last one (Off state opens the config modal) needs the same non-owner guard: a shared, unpublished/unconfigured Device's marker shouldn't open an editable config screen for a non-owner. Route it to a read-only view instead, or simply disable the click in that case — your call on which reads better, note whichever you pick in a short comment.

### Phase 4 — Read-only Workflow canvas for a shared Workflow

Wherever the canvas lives (`app/(app)/workflows/[id]/...` — `WorkflowEditor.tsx`/`TaskNode.tsx` per Part 1's grep, plus whatever renders Feed Nodes and the edge config popovers from BL-060/061): when the open Workflow's `ownerId !== currentUserId` (i.e. you're viewing it because it's `shared`), the whole canvas goes read-only in one pass rather than disabling each control individually if that's easier — no drag-to-reposition on any node, no opening any edge/node config popover for editing, Run/Stop toggle disabled, Save disabled. A single `.chip-shared` badge in the toolbar (near the Workflow name) communicates the whole-canvas read-only state, per `CHARTE-GRAPHIQUE.md`'s note that this is pinned once for the canvas rather than repeated per node.

### Phase 5 — Admin "Shared resources" tab

`app/(app)/settings/SettingsTabs.tsx`: add a fourth tab, `"sharing"`, admin-gated exactly like `"users"`/`"bugs"` (hidden entirely for non-admins, not just disabled) — label "Shared resources".

New `app/(app)/settings/SharedResourcesTable.tsx`, modeled on `UsersTable.tsx`/`BugReportsTable.tsx`:
- Fetches `GET /api/admin/shared-resources` (Part 1, Phase 4) on mount.
- Three sections or one combined table with a Type column (`.chip` tag: Device / Workflow / Item Feed) — your call on which reads better given the likely row count, note which you picked.
- Columns: Type, Name, Owner (name, email beneath in small text — same stacked pattern as the Devices list's Name+Collector-ID), Shared (a toggle switch — per `CHARTE-GRAPHIQUE.md`, not a button-with-confirmation, since this is a persistent on/off state).
- Toggling calls `PATCH /api/{devices|workflows|item-feeds}/[id]/share` with `{ shared: <new value> }` (route per model, picked by the row's Type), optimistically flips the row, reverts + shows an error snack on failure.
- No row click-through to anything else.

### Verify

- As a `USER` who owns nothing shared with them: Devices/Workflows/Item Feeds lists show no `.chip-shared` badges, all row actions enabled on their own rows.
- Have an `ADMIN` share one Device, one Workflow, and one Item Feed belonging to a different user (via the new admin screen, end to end). Confirm all three now appear with a `.chip-shared` badge and disabled mutate-controls for a third user who owns none of them.
- Shared Device on the Overview map, Edit mode on: reposition-drag does nothing, clicking it doesn't open an editable config modal, but the right-click Copy/Duplicate still work and produce a self-owned clone.
- Shared Workflow's canvas: opens, renders, but every edit surface (drag, node/edge popovers, Run/Stop, Save) is inert; the toolbar shows the shared badge.
- Admin "Shared resources" tab: only visible to `ADMIN` sessions (confirm a `USER` session gets no such tab, and that hitting the underlying route directly still 403s for them). Toggling Shared on/off there is immediately reflected the next time a non-owning user loads the corresponding list.
- Re-confirm (carried over from Part 1's own Verify, worth one more pass now that the UI exists) that an `ADMIN`'s *normal* Devices/Workflows/Item Feeds list pages still show only their own + shared items — not everything — even though the same admin's Settings tab can see across all users.

### Conventions (same as every previous batch)

- Work on `staging`. Commit message(s) reference BL-068/BL-069. `npm version minor --no-git-tag-version` (one bump for this commit, covering both).
- If the exact file names for the Workflows-list or Item-Feeds-list pages differ from the guesses above, that's fine — find the real ones and use them; the guesses are there to save you a search, not to be treated as fact.
- If Phase 3/4's "which specific interactions should stay enabled on a shared marker/canvas" turns out ambiguous once you're looking at the real component, make the more conservative call (disable it) and note it in `CLAUDE-CONCEPT.md` section 17 rather than guessing permissive.
