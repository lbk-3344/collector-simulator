# Claude Code prompt — BL-074: Device state rework — rename, animated "Active", new manual "Offline"

## Task:

Luc reviewed the current 4-state Device model (`lib/deviceState.ts`, `CLAUDE-CONCEPT.md` §15.3) and asked for three changes to how a Device's status displays, plus one new capability:

1. **Rename two states to match how he actually talks about them** — the state today called `ACTIVE` ("configured, published, not in a workflow") is what Luc calls **Ready**; the state today called `AUTOMATED` ("published, in a *running* workflow") is what Luc calls **Active**. This is a real terminology swap, not a typo — don't skip it, it's the single easiest thing to get backwards while implementing the rest of this prompt.
2. **`PROBLEM` (published, in a workflow that's *stopped*, red) is retired.** Luc: "today red meant the workflow is not running. Now the change is when the workflow is not running, the device turns into Ready." A Device attached to a stopped Workflow's Task now displays identically to one with no Workflow at all — both are just Ready.
3. **The renamed `Active` state (running workflow) keeps the same full green as `Ready`** — no more "lighter green" — and instead shows it's *live* via an animated icon/background, not a paler color.
4. **New: a manual `Offline` state (red)** — a Ready device can be explicitly turned off (new button, described below); while Offline, its heartbeat stops and it can't receive a manual send (§15.6/§16 — manual send itself is still a future BL, "on verra ça plus tard," but Offline must exclude it once it exists). Red is now reserved for this state only, superseding its old "workflow stopped" meaning per point 2. **A Device that's `Active` (in a running workflow) cannot be turned Offline directly** — no button for it there; taking it offline means going to stop the Workflow itself (out of scope here — Workflow stop/start already exists on the Workflows page).

Final state set, in the same precedence order `getDeviceState` should check them:

| State | Condition | Color | Notes |
|---|---|---|---|
| **Pending** | `!configured \|\| !publishedAt` | Gray (unchanged) | Was "Off" — same condition, keeping the name is fine too, but rename for consistency with the rest of this table (see Phase 1). No heartbeat. |
| **Active** | `configured && publishedAt && task.workflow.status === "RUNNING"` | Full green, **animated** | Was "Automated". Checked *before* Offline — see the precedence note below. Heartbeat active. Manual send N/A (it's automated). |
| **Offline** | `configured && publishedAt && offlineAt != null && not Active` | Red (new) | Manually set. No heartbeat. No manual send. Only reachable from Ready. |
| **Ready** | everything else (`configured && publishedAt`, not Active, not Offline) | Full green (unchanged, same shade as Active) | Was "Active". Covers both "no workflow attached" and "workflow attached but stopped" — the old Problem case collapses into this. Heartbeat active. Manual send target (future BL). |

**Precedence decision, flagging it explicitly since Luc's message doesn't cover this edge case and I'm making a judgment call**: if a Device is manually Offline and its Task's Workflow is later started, it shows **Active**, not Offline — a running workflow always overrides the manual flag, matching the "can't manually stop an Active device" rule symmetrically (a workflow starting doesn't get silently blocked by a stale manual toggle either). `offlineAt` itself is **not** cleared when this happens — if the workflow later stops again, the Device reverts to **Offline** (not Ready), respecting the user's last explicit choice rather than silently discarding it. If this isn't the behavior Luc wants, it's a one-line change to the precedence check in Phase 2 — flag it back rather than guessing further.

**Explicitly out of scope for this prompt**: the run engine (`lib/workflowRun.ts`) doesn't check Device state at all today before firing a Task's channel — an Offline Device attached to a running Workflow's Task will still have its reads processed exactly as before. Making the run engine actually skip/warn on an Offline device's channel is a real follow-up (log it in `BACKLOG.md` as a new unchecked note, don't build it) — Luc's request here was about status/colors and the manual toggle, not run-engine gating.

### Phase 1 — rename, schema, derivation (`lib/deviceState.ts`, `prisma/schema.prisma`)

`prisma/schema.prisma`, `Device` model — add, next to `publishedAt`:

```prisma
  // Manually set via PATCH /api/devices/[id]/offline (BL-074, 2026-09-0X).
  // Null = not manually offline. Only meaningful when configured+published;
  // ignored entirely while the Device is Active (a running Workflow always
  // wins — see lib/deviceState.ts's precedence comment). Not cleared when a
  // Workflow start overrides it, so it's restored once that Workflow stops.
  offlineAt DateTime?
```

`npx prisma migrate dev --name add_device_offline_state`.

`lib/deviceState.ts` — full rewrite:

```typescript
export type DeviceState = "PENDING" | "READY" | "ACTIVE" | "OFFLINE";

interface DeviceStateInput {
  configured: boolean;
  publishedAt?: string | Date | null;
  offlineAt?: string | Date | null;
  task?: { workflow?: { status: "RUNNING" | "STOPPED" } | null } | null;
}

// Pure, not a stored column — see CLAUDE-CONCEPT.md section 15.3. Revised
// 2026-09-0X (BL-074): renamed to match how Luc actually refers to these
// (old ACTIVE -> READY, old AUTOMATED -> ACTIVE), retired the old PROBLEM
// state (a stopped-workflow Device now just reads as Ready, same as no
// workflow at all), and added a manual OFFLINE state. Precedence matters:
// a running workflow always wins over a manual offline flag, so ACTIVE is
// checked before OFFLINE.
export function getDeviceState(device: DeviceStateInput): DeviceState {
  if (!device.configured || !device.publishedAt) return "PENDING";
  const workflow = device.task?.workflow ?? null;
  if (workflow?.status === "RUNNING") return "ACTIVE";
  if (device.offlineAt) return "OFFLINE";
  return "READY";
}
```

### Phase 2 — colors + animation (`CHARTE-GRAPHIQUE.md`, `app/globals.css`)

Replace the "Device states" section's token block and table in `CHARTE-GRAPHIQUE.md` with:

Light mode:
```css
--device-pending: #93A0A6; /* = --ink-3, unchanged */
--device-ready:   #1E8E5A; /* = --success, unchanged (was --device-active) */
--device-active:  #1E8E5A; /* = --success — same as Ready now, was the lighter --device-automated */
--device-offline: #C41E3A; /* = --danger — was --device-problem's "workflow stopped" meaning, now "manually offline" */
```

Dark mode (both the media-query block and `:root[data-theme="dark"]`):
```css
--device-pending: #6A7880;
--device-ready:   #4ADE94;
--device-active:  #4ADE94;
--device-offline: #FF6B7F;
```

Remove `--device-off`/`--device-automated`/`--device-problem` — nothing should reference the old names after this (grep `app/globals.css` and every `.tsx` for them once done). Update the states table underneath to the 4-row version from the task description above.

**Animated "Active" indicator** — add to `app/globals.css`, a pulsing ring behind the marker/dot rather than a color change:

```css
@keyframes device-active-pulse {
  0%   { transform: scale(1);   opacity: 0.55; }
  100% { transform: scale(1.9); opacity: 0; }
}

.map-marker-device[data-state="active"]::after,
.device-state-active .device-state-dot::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--device-active);
  animation: device-active-pulse 1.6s ease-out infinite;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .map-marker-device[data-state="active"]::after,
  .device-state-active .device-state-dot::after {
    animation: none;
    display: none;
  }
}
```

`.map-marker-device` already renders with `position: relative` inline (`LocationMapCard.tsx`), so the `::after` ring positions correctly against it. `.device-state-dot` (Devices list) will need `position: relative` added in CSS if it doesn't already have it, so its own `::after` ring positions correctly there too — check before assuming. Verify visually (or via a quick DOM check) that the ring doesn't get clipped by `overflow: hidden` on any ancestor.

### Phase 3 — the toggle: API route + both surfaces

New route, mirroring the existing `PATCH /api/devices/[id]/share` pattern (`app/api/devices/[id]/share/route.ts`):

`app/api/devices/[id]/offline/route.ts` — `PATCH`, body `{ offline: boolean }`. Auth/ownership-guard the same way the existing `[id]/route.ts` PATCH does (session check, owner-or-shared-read-only rules — a read-only shared Device must reject this like every other mutation). Server-side guard, don't trust the client to only call this from a Ready device: reject with `409` (message: "Device must be Ready to change its offline status.") unless `getDeviceState(device) === "READY" || getDeviceState(device) === "OFFLINE"` (i.e. allow toggling either direction between those two, reject from Pending or Active). On `{ offline: true }` set `offlineAt = new Date()`; on `{ offline: false }` set `offlineAt = null`.

**Devices list** (`app/(app)/devices/page.tsx`) — add a new row-icon-btn next to the existing Edit/Duplicate/Delete actions (same `row-icon-btn` pattern), a small inline SVG (follow how `EditIcon`/`DuplicateIcon` etc. are defined locally in this same file — a power/plug icon works, e.g. a circle with a vertical line through the top, standard "power" glyph). Behavior:
- State `READY` → shows enabled, `aria-label`/`title` "Turn offline", calls the new PATCH with `{ offline: true }`.
- State `OFFLINE` → shows enabled, `aria-label`/`title` "Turn on", calls the PATCH with `{ offline: false }`.
- State `PENDING` or `ACTIVE` → disabled, `title` explaining why ("Publish this device first" / "Part of a running workflow — stop the workflow to take this offline").
- Respect the existing `readOnly` (shared, not owned) flag exactly like the other row actions do — disabled + same "Shared with you — read-only" title.
- Use the same `busyId`/`isBusy` pattern already used for Duplicate while the request is in flight.

**Overview map** (`app/(app)/LocationMapCard.tsx`) — `handleDeviceClick`'s branching needs a 4th case for the renamed states:
```typescript
const state = getDeviceState(device);
if (state === "PENDING") {
  setConfigModal({ device, lockTypeAndSite: true, deleteOnCancelIfUnsaved: false });
} else if (state === "READY" || state === "OFFLINE") {
  setManualSendDevice(device); // reuse the existing modal for both — see below
} else {
  setInfoPanelDevice(device); // ACTIVE only now that PROBLEM is gone
}
```
Rework the existing "Manual data send" modal (`manualSendDevice`) to branch on the actual state inside it, since it's now shared between Ready and Offline:
- **Ready**: unchanged "Manual data send — coming soon" body, plus a new footer button (next to Close) — "Turn device offline" — calling the same PATCH, closing the modal on success (or showing an inline error, same pattern as other in-modal failures in this app).
- **Offline**: swap the body copy to something like "This device is offline — heartbeat and manual send are paused." and the footer button becomes "Turn device on".

Consider whether the modal title should stay "Manual data send" for both cases or become state-dependent (e.g. "Device offline" when Offline) — small UX call, use your judgment, doesn't need to come back to Luc.

The **read-only info panel** (`infoPanelDevice`, now only reachable for `ACTIVE`) gets one added line for clarity — something like a note under the existing State row: "Stop the workflow to take this device offline." No new action button there (per Luc: can't stop an Active device individually).

### Phase 4 — heartbeat exclusion

`lib/deviceHeartbeat.ts`'s `runHeartbeatTick()` query currently selects `heartbeatEnabled: true, publishedAt: { not: null }, collectorId: { not: null }`. Add `OR`-style exclusion so a manually-Offline Device (per the same precedence as `getDeviceState` — Offline only really "counts" when the Device isn't Active) stops being ticked. Since `getDeviceState`'s full precedence needs the Task/Workflow relation to resolve correctly (Active overrides Offline), either: (a) include `task: { include: { workflow: true } }` in this query's `select` and filter the fetched rows in JS using `getDeviceState()` before proceeding (simplest, matches the existing small-scale device count in this tick), or (b) write the equivalent Prisma `where` inline (`OR: [{ offlineAt: null }, { task: { workflow: { status: "RUNNING" } } }]`). Prefer (a) — it reuses the single source of truth (`getDeviceState`) instead of re-deriving the same precedence logic a second time in a raw Prisma filter, which is exactly the kind of duplication that drifts out of sync later.

### Phase 5 — docs

- `CLAUDE-CONCEPT.md` §15.3: replace the whole "four colors" table/description with the new 4-state precedence table and the Active-overrides-Offline note, exactly as reasoned in this prompt's task description.
- §15.1: add `offlineAt` to the field list (short version of the schema comment above).
- §15.6: update the map click-behavior bullets for the renamed states + the new Offline branch.
- §15.7: note the new row action on the Devices list.
- §13: new dated decision-log entry summarizing the rename, the Problem retirement, the animated-Active choice, the new Offline state, and the two explicit judgment calls flagged in this prompt (Active-overrides-Offline precedence, run-engine gating left out of scope).
- `BACKLOG.md`: new **BL-074** entry (checked off on completion) for this work, and a short new unchecked note logging the run-engine offline-gating follow-up as future work, so it isn't lost.

### Verify

- A never-published Device still shows Pending/gray, unchanged behavior.
- A published Device with no Workflow shows Ready/full green; turning it Offline flips it to red, clears/stops its heartbeat ticking (check `lib/deviceHeartbeat.ts` skips it on the next tick), and the Devices-list/map toggle both work and stay in sync (toggle from one surface, confirm the other reflects it on reload).
- A published Device attached to a **stopped** Workflow's Task shows Ready (not a distinct color) — confirms the Problem retirement.
- A published Device attached to a **running** Workflow's Task shows Active/full green with the pulse animation visible on both the map marker and the Devices list dot, and its row-action toggle button is disabled with the "stop the workflow" explanation.
- Starting a Workflow whose Task's Device was manually Offline flips that Device to Active (animated); stopping that Workflow again reverts it to Offline, not Ready (confirms the precedence + non-cleared-`offlineAt` behavior).
- `prefers-reduced-motion: reduce` (test via browser devtools emulation) turns the pulse off cleanly, no layout shift.
- A read-only shared Device's toggle button is disabled with the existing "read-only" messaging, same as its other row actions.
- Existing E2E suite still green; nothing else references the removed `--device-off`/`--device-automated`/`--device-problem` tokens or the `OFF`/`ACTIVE`/`AUTOMATED`/`PROBLEM` state names anywhere in `app`/`components`/`lib` (grep to confirm).

### Conventions

- Branch `staging`.
- New backlog item, no letter suffix → `npm version minor --no-git-tag-version`, same commit as the fix.
- Check off `BACKLOG.md` BL-074 with a short completion note, and add the run-engine-gating follow-up as a new unchecked note per Phase 5.
