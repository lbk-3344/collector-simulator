## Task: Device cloning — Devices list "Duplicate" + map Copy/Paste/Duplicate — BL-065, BL-066

Direct request from Luc, 2026-08-31: a fast way to clone an existing Device instead of re-entering every field by hand, from two places — the Devices list, and a new right-click context menu on the Overview map (the first context menu in this app).

Full spec: `CLAUDE-CONCEPT.md` section 15.9 (added 2026-08-31), section 13's 2026-08-31 (later same day) decision-log entry. Backlog: `BACKLOG.md` BL-065/BL-066. Visual spec for the new row icon and the context menu: `CHARTE-GRAPHIQUE.md` "Devices list page" (revised) and "Context menu" (new).

### Important framing before you start

- **One clone endpoint, two callers.** Both the Devices-list Duplicate button and the map's Copy/Paste/Duplicate menu drive the same `POST /api/devices/[id]/duplicate` — don't write the cloning logic twice.
- **A clone always starts unpublished, even if the source is published.** This was explicitly confirmed with Luc, not assumed: `publishedAt`, `lastSyncedAt`, `lastSyncError`, `platformReconciliation` are always reset to `null` on the clone, regardless of what the source has. A clone of a published Device is **never** auto-registered against the real Bartender platform — it must go through an explicit Publish action later, exactly like any other new Device. Do not call `POST /collectors/register` (or any other real Bartender API) anywhere in this batch.
- **`collectorId` is always regenerated, never copied.** The column is `@unique` — copying it verbatim would throw. Reuse the exact sequence `GET /api/devices/suggest-code` already computes (`{locationCode}-{type}-{NN}`, next-available `NN` for that Site+Type pair) rather than writing a second implementation of that logic — factor it into a shared function both routes call, or have the duplicate route call the same counting query directly.
- **`name` gets a literal `" (Copy)"` suffix** — `${source.name} (Copy)`. No de-duplication logic needed if a Device (or something already named "… (Copy)") gets cloned again — "… (Copy) (Copy)" is fine, per Luc's own wording ("we add (Copy) to the name").
- **The map's context menu only opens in Edit mode** — same gating as every other map-editing interaction (drag-to-create, drag-to-reposition). Outside Edit mode, right-click does nothing special (browser default).
- **Neither entry point auto-opens the config screen** after cloning — the clone is already exactly as configured as its source. This is a quick-clone gesture, not a mini creation wizard.

### Phase 1 — `POST /api/devices/[id]/duplicate`

New route, `app/api/devices/[id]/duplicate/route.ts` (same auth pattern as the rest of `app/api/devices/*` — `getServerSession`, 401 if absent).

Request body (all optional): `{ positionX?: number; positionY?: number }`.

Logic:
1. Load the source Device by `params.id` (404 if missing).
2. Compute a fresh `collectorId`: `{source.locationCode}-{source.type}-{NN}`, `NN` the next-available 2-digit sequence for that `(locationCode, type)` pair — same `prisma.device.count({ where: { locationCode, type } })` + `padStart(2, "0")` logic as `app/api/devices/suggest-code/route.ts`. Pull this into a small shared helper (e.g. `lib/deviceCollectorId.ts` exporting `suggestCollectorId(locationCode, type)`) and have both the existing `suggest-code` route and this new route call it, rather than duplicating the query.
3. Build the new row:
   - Copied from source: `type`, `locationCode`, `model`, `vendor`, `configVersion`, `heartbeatEnabled`, `heartbeatTimeoutSeconds`, `attributes`, `channels`, `configured`.
   - `name`: `` `${source.name} (Copy)` ``.
   - `collectorId`: the freshly computed value from step 2.
   - `publishedAt`, `lastSyncedAt`, `lastSyncError`, `platformReconciliation`: all `null`, unconditionally — do not branch on the source's own values.
   - `positionX`/`positionY`: from the request body if present, else `null`.
   - No `task` connection — the clone starts with no Task, full stop.
4. `prisma.device.create(...)`, return `{ device }` shaped exactly like the other `/api/devices*` routes' response (include whatever the existing `DEVICE_INCLUDE` in `app/api/devices/route.ts` uses, so the client gets a `task: null` field consistent with `DeviceRecord`'s type).

### Phase 2 — Devices list "Duplicate" row action (BL-065)

`app/(app)/devices/page.tsx`:

- Add a `DuplicateIcon` component (two-overlapping-rounded-rectangles glyph, same 20x20 viewBox/stroke conventions as the existing `EditIcon`/`TrashIcon` in this file).
- Add a third `.row-icon-btn` between Edit and Delete, `aria-label`/`title` "Duplicate", ghost styling like the Delete button (not the solid-orange Edit treatment) per `CHARTE-GRAPHIQUE.md`.
- `onClick`: `POST /api/devices/${device.id}/duplicate` with an empty body (no position), then `await load()` to refresh the table. Use the same `busyId` pattern already used for Delete so the row shows a busy/disabled state during the call; surface any error the same way `handleDelete` does (`setError(...)`).
- No config modal opens on success.

### Phase 3 — Map right-click Copy/Paste/Duplicate context menu (BL-066)

`app/(app)/LocationMapCard.tsx`:

- New small local component (inline in this file or a new `components/DeviceContextMenu.tsx` — your call, but keep it a plain floating `position: fixed` panel per `CHARTE-GRAPHIQUE.md` "Context menu", not a library). Props: `x`, `y` (client coordinates), `canPaste: boolean`, `onCopy`, `onPaste`, `onDuplicate`, `onClose`.
- New state on `LocationMapCard`: `deviceClipboard: DeviceRecord | null` and `contextMenu: { x: number; y: number; device: DeviceRecord } | null`.
- On each Device marker's wrapping element, add `onContextMenu={editMode ? (e) => handleDeviceContextMenu(e, device) : undefined}` — `handleDeviceContextMenu` calls `e.preventDefault(); e.stopPropagation();` and sets `contextMenu = { x: e.clientX, y: e.clientY, device }`.
- Render the menu when `contextMenu` is set, positioned at `contextMenu.x`/`contextMenu.y`, clamped so it doesn't render past the viewport's right/bottom edge (same defensive clamping spirit as nothing currently does elsewhere in this file — just clamp against `window.innerWidth`/`innerHeight` minus the menu's approximate size).
- Dismiss on outside click + `Escape`, mirroring `UserMenu.tsx`'s `useEffect` pattern (`document.addEventListener("click", ...)` / `("keydown", ...)`, cleaned up on unmount/close).
- **Copy**: `setDeviceClipboard(contextMenu.device)`, close the menu. No server call.
- **Paste**: disabled (non-interactive, 40% opacity) when `deviceClipboard` is `null`. Otherwise: convert `contextMenu.x`/`contextMenu.y` to floor-plan coordinates with the existing `clientToFloorPlanCoords`, `POST /api/devices/${deviceClipboard.id}/duplicate` with `{ positionX, positionY }` from that conversion, add the returned device to `devices` via `onDevicesChange`, close the menu. Do **not** clear `deviceClipboard` afterward — it must stay pasteable again.
- **Duplicate**: `POST /api/devices/${contextMenu.device.id}/duplicate` with `{ positionX: (contextMenu.device.positionX ?? 0) + 24, positionY: (contextMenu.device.positionY ?? 0) + 24 }`, add the returned device to `devices` via `onDevicesChange`, close the menu. Does not read or touch `deviceClipboard`.
- None of the three opens `configModal`.

### Verify

- `npm run build` passes.
- Devices list: Duplicate on a fully-configured, published Device produces a new row named `"<original> (Copy)"`, a different Collector ID following the `{site}-{type}-{NN}` sequence, `configured: true`, and reads as **Off**/"Not configured" (i.e. actually unpublished) despite the source being published — confirm this by checking the created row's raw fields, not just its color, so a silently-copied `publishedAt` doesn't slip through.
- Devices list: Duplicate on a still-unconfigured shell Device produces another unconfigured shell (not accidentally marked `configured: true`).
- Map, Edit mode on: right-click a Device marker opens the menu at the cursor; right-click with Edit mode off does nothing (browser default menu appears instead).
- Map: Copy on device A, then Paste from a right-click on a *different* device B's menu — confirm the pasted clone is A's data (not B's), placed at B's context-menu cursor position, and that Paste again (same clipboard, no new Copy) works a second time.
- Map: Duplicate on a device places the clone at a visibly offset position (+24/+24) from the source, without disturbing whatever's currently in `deviceClipboard`.
- Confirm two Devices can never collide on `collectorId` — clone the same source device twice in a row (list Duplicate twice) and check both clones got distinct, sequential Collector IDs.
- Confirm no real Bartender API call is made anywhere in this flow (check `lib/bartenderDataCollector.ts`'s functions aren't imported into the new route) — the whole point of the publish-state reset is that cloning is 100% local.

### Conventions (same as every previous batch)

- Work on `staging`. Commit message(s) reference BL-065/BL-066. `npm version minor --no-git-tag-version` (new feature, no letter suffix) — one bump for this commit.
- If anything about the context-menu clamping, icon choice, or Paste-target position turns out genuinely ambiguous once you're looking at the real map layout — make a reasonable call and note it in `CLAUDE-CONCEPT.md` section 15.9 rather than blocking, same as usual; ask Luc only for something that would be awkward to change later (there isn't anything obviously like that in this batch).
- Separately, unrelated to this batch: BL-053's `heartbeatConfig` request shape is still unresolved (10+ shapes tried, all rejected, no YAML in this repo) — still needs the schema from Luc whenever it comes up in conversation with him.
