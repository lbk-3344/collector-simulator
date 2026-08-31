## Task: Item Feed cloning — Duplicate (list) and Copy / Paste / Duplicate (canvas context menu) — BL-071

Direct request from Luc, 2026-08-31: the same cloning affordance already shipped for Devices (BL-065/066), for Item Feeds instead. Full spec: `CLAUDE-CONCEPT.md` section 16.9 (cross-references 15.9 and 17.3). Backlog: `BACKLOG.md` "Item Feed cloning" section, BL-071. Visual spec: `CHARTE-GRAPHIQUE.md`'s "Context menu (right-click)" section, second-call-site note.

### Important framing before you start

- **This is not the same thing as placing a Feed again.** Dragging an Item Feed from the canvas palette onto a Workflow already creates a new `FeedNode` referencing the *same* `ItemFeed` id (BL-059) — editing that definition later changes every placement at once. **Duplication is different**: it creates a brand-new, independent `ItemFeed` row (own id, own name, own owner) that can be edited afterward without touching the original — same relationship Device duplication already has to a plain Device. Don't reuse or extend the existing "drag from palette" code path for this; it's a separate `POST /api/item-feeds/[id]/duplicate` endpoint, same shape as `POST /api/devices/[id]/duplicate`.
- **Disabled-on-shared behavior differs deliberately by entry point, matching the real, already-shipped Device precedent** (not a spec I'm guessing at — I read the actual code): on the **Devices list**, Duplicate is `disabled` on a shared-not-owned row. On the **Overview map**'s context menu, Copy/Duplicate stay enabled on a shared marker (cloning doesn't mutate the shared record, so it's allowed as a read-only-friendly operation). Follow the same split here: the **Item Feeds list**'s new Duplicate button is disabled on shared-not-owned rows (mirrors the Devices list). The **Workflow canvas**'s context menu doesn't need a separate per-node shared check at all — see the next bullet.
- **The canvas's read-only gate is simpler than the map's.** `WorkflowEditor.tsx` already has a single `readOnly` flag (true when the open Workflow is shared-not-owned) that gates every mutation entry point. Because `POST /api/tasks` and `POST /api/feed-nodes` both enforce "Device/ItemFeed and Workflow must share the same owner" (§17.3), every Feed Node inside an owned Workflow is guaranteed to reference an Item Feed you also own — there's no such thing as an individually-shared Feed Node inside your own canvas. So the new context menu just needs `!readOnly` — same gate already used for drag/connect/delete on this page — nothing per-node.
- **Reuse, don't fork, the context-menu component.** `components/DeviceContextMenu.tsx`'s props (`x`, `y`, `canPaste`, `onCopy`, `onPaste`, `onDuplicate`, `onClose`) are already fully generic — nothing Device-specific in them. Rename the file/component to `components/ContextMenu.tsx` / `ContextMenu`, update `LocationMapCard.tsx`'s one import, and use it for both call sites.
- **Scope the canvas menu to Feed Nodes only.** Right-clicking a Task node should do nothing new — Device/Task cloning already has its own two entry points (Devices list, Overview map).

### Phase 1 — `POST /api/item-feeds/[id]/duplicate`

New file `app/api/item-feeds/[id]/route.ts`-adjacent: `app/api/item-feeds/[id]/duplicate/route.ts`. Mirrors `app/api/devices/[id]/duplicate/route.ts` exactly in structure, adapted to `ItemFeed`'s own fields (from `prisma/schema.prisma`'s `ItemFeed` model — `kind`, `gtins`, `categoryCode`, `presentMatchMode`, `quantityMin`, `quantityMax`, `locationCode`, `zoneCode`, `fixedItems`; no position fields at all, unlike Device):

```typescript
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/ownership";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const source = await prisma.itemFeed.findUnique({ where: { id: params.id } });
  if (!source || (!isOwner(source, session.user.id) && !source.shared)) {
    return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  }

  const itemFeed = await prisma.itemFeed.create({
    data: {
      ownerId: session.user.id,
      shared: false,
      name: `${source.name} (Copy)`,
      kind: source.kind,
      categoryCode: source.categoryCode,
      presentMatchMode: source.presentMatchMode,
      quantityMin: source.quantityMin,
      quantityMax: source.quantityMax,
      locationCode: source.locationCode,
      zoneCode: source.zoneCode,
      ...(source.gtins !== null ? { gtins: source.gtins as never } : {}),
      ...(source.fixedItems !== null ? { fixedItems: source.fixedItems as never } : {}),
    },
  });

  return NextResponse.json({ itemFeed });
}
```

No request body needed — unlike Device (which takes an optional `positionX`/`positionY`), an `ItemFeed` has nowhere of its own to be positioned; that's the canvas entry point's job (Phase 4). Confirm the `Json` field spread pattern (`...(x !== null ? {...} : {})`) against whatever Prisma actually wants at compile time — the Device route uses the identical pattern for its own `Json?` fields (`attributes`/`channels`), so it should type-check the same way here.

### Phase 2 — Item Feeds list "Duplicate" row action

`app/(app)/item-feeds/page.tsx`. Add a `DuplicateIcon` (copy it verbatim from `app/(app)/devices/page.tsx` — the two-overlapping-squares glyph) and a `handleDuplicate` function next to the existing `handleDelete`:

```typescript
async function handleDuplicate(feed: ItemFeedRecord) {
  setBusyId(feed.id);
  setError(null);
  const res = await fetch(`/api/item-feeds/${feed.id}/duplicate`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    setError(data?.error ?? "Couldn't duplicate this item feed.");
  }
  await load();
  setBusyId(null);
}
```

Insert a third row-icon button between the existing Edit and Delete buttons (same `readOnly` variable already computed per-row at line ~130):

```tsx
<button
  className="row-icon-btn row-icon-btn-ghost"
  aria-label="Duplicate"
  title={readOnly ? "Shared with you — read-only" : "Duplicate"}
  disabled={busyId === feed.id || readOnly}
  onClick={() => handleDuplicate(feed)}
>
  <DuplicateIcon />
</button>
```

No modal opens automatically — the clone appears on the table's next reload, exactly as configured as its source, ready to use or edit like any existing row (matches the Devices-list Duplicate's behavior).

### Phase 3 — Generalize the context-menu component

Rename `components/DeviceContextMenu.tsx` → `components/ContextMenu.tsx`, and the exported function `DeviceContextMenu` → `ContextMenu`. Nothing else in the file needs to change — it's already content-agnostic. Update its one existing import/usage in `app/(app)/LocationMapCard.tsx` (`import { DeviceContextMenu } from "@/components/DeviceContextMenu"` → `import { ContextMenu } from "@/components/ContextMenu"`, and the JSX tag `<DeviceContextMenu ...>` → `<ContextMenu ...>`). Nothing about `LocationMapCard.tsx`'s actual behavior changes — this is a pure rename.

### Phase 4 — Workflow canvas: right-click a Feed Node

`app/(app)/workflows/[id]/WorkflowEditor.tsx`. Import the renamed `ContextMenu` from Phase 3. Add local state next to the existing `feedModal`/`editFlowId` state:

```typescript
const [feedClipboard, setFeedClipboard] = useState<{ itemFeedId: string } | null>(null);
const [feedContextMenu, setFeedContextMenu] = useState<{ x: number; y: number; node: Node } | null>(null);
```

Add a duplicate helper next to the existing fetch-based handlers (`load`, `patchWorkflow`, etc.) — a two-call sequence (clone the `ItemFeed`, then place a `FeedNode` for it), followed by a reload:

```typescript
const duplicateFeedNode = useCallback(
  async (sourceItemFeedId: string, positionX: number, positionY: number) => {
    if (readOnly) return;
    const dupRes = await fetch(`/api/item-feeds/${sourceItemFeedId}/duplicate`, { method: "POST" });
    if (!dupRes.ok) return;
    const { itemFeed } = await dupRes.json();
    await fetch("/api/feed-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowId,
        itemFeedId: itemFeed.id,
        positionX: Math.round(positionX),
        positionY: Math.round(positionY),
      }),
    });
    await load();
  },
  [workflowId, load, readOnly]
);
```

Wire the right-click handler and menu into the `<ReactFlow>` element (same block as `onNodeClick`, `onNodeDragStop`, etc. — around line ~450):

```tsx
onNodeContextMenu={(e, node) => {
  if (readOnly || node.type !== "feed") return;
  e.preventDefault();
  setFeedContextMenu({ x: e.clientX, y: e.clientY, node });
}}
```

And, alongside the existing `<ItemFeedModal>` render near the bottom of the component's JSX:

```tsx
{feedContextMenu && (
  <ContextMenu
    x={feedContextMenu.x}
    y={feedContextMenu.y}
    canPaste={feedClipboard !== null}
    onCopy={() => setFeedClipboard({ itemFeedId: (feedContextMenu.node.data as Any).itemFeedId })}
    onPaste={() => {
      if (!feedClipboard) return;
      const pos = screenToFlowPosition({ x: feedContextMenu.x, y: feedContextMenu.y });
      duplicateFeedNode(feedClipboard.itemFeedId, pos.x, pos.y);
    }}
    onDuplicate={() => {
      const itemFeedId = (feedContextMenu.node.data as Any).itemFeedId as string;
      duplicateFeedNode(itemFeedId, feedContextMenu.node.position.x + 24, feedContextMenu.node.position.y + 24);
    }}
    onClose={() => setFeedContextMenu(null)}
  />
)}
```

Notes on the two positioning cases, since they're not symmetric:
- **Duplicate** offsets from the right-clicked node's own `position` — that's already flow-space (React Flow node coordinates), so no conversion needed, same reasoning as the map's `+24/+24` in floor-plan pixels.
- **Paste** places at wherever the menu itself was opened (`feedContextMenu.x/y`, screen/client coordinates) — convert via `screenToFlowPosition`, the canvas's equivalent of the map's `clientToFloorPlanCoords`. Don't reuse the right-clicked node's position for Paste — the clipboard's feed might have been copied from a different node than the one just right-clicked to open the menu for Paste.

Copy needs no server call — same as the map's Copy, it's local state only. `feedClipboard` and `feedContextMenu` don't need to survive a page reload or be cleared on `load()` — matches the map's `deviceClipboard`'s own lifetime (gone on reload, otherwise persists across actions).

### Verify

- **Item Feeds list**: Duplicate button between Edit and Delete on every row, disabled (40% opacity, "Shared with you — read-only" title) on a shared-not-owned row, enabled on your own rows. Clicking it on an owned row adds a new "{name} (Copy)" row on reload, with the same kind/GTINs/quantities/location as the source, `usageCount: 0` (a fresh clone starts with no `FeedNode` placements).
- **`POST /api/item-feeds/[id]/duplicate`**: 401 unauthenticated; 404 for a feed you neither own nor have shared with you; 200 + independent new row for one you own or one shared with you (confirm the new row's `ownerId` is the caller and `shared` is `false`, even when cloning a feed that was itself `shared: true`); editing the clone afterward doesn't change the original (spot-check one field).
- **Workflow canvas, right-click a Feed Node**: opens the same three-row Copy/Paste/Duplicate menu used on the Overview map, positioned at the cursor, clamped to the viewport. Right-clicking a Task node does nothing (no menu, browser default suppressed or not — your call, just don't wire anything new there). Right-clicking a Feed Node while viewing a **shared, not-owned** Workflow does nothing (whole canvas is already read-only) — confirm this explicitly, it's an easy one to get backwards.
- **Duplicate (canvas)**: creates a new `ItemFeed` + a new `FeedNode` at +24/+24 from the source node, visible on the canvas after reload, not opening the edit modal.
- **Copy then Paste (canvas)**: Copy on one Feed Node, then right-click empty canvas space or another node and Paste — places a clone of the *copied* feed (not the node you right-clicked to open the Paste menu) at the click position, converted correctly via `screenToFlowPosition` (drop it somewhere away from the original and confirm the new node lands under the cursor, not at some stale coordinate). Paste again elsewhere — clipboard isn't consumed, a second independent clone appears.
- **Right-click doesn't also trigger the existing click-to-edit behavior** — `onNodeClick` already opens `ItemFeedModal` for a Feed Node on any click; explicitly confirm a right-click opens *only* the new context menu, not both at once. (This exact bug class hit the map's Device context menu once already — commit `65acf95`, "right-click a map device opened both the context menu and the edit modal" — worth a deliberate check here even though `onNodeContextMenu` is a distinct React Flow prop from `onNodeClick`.)
- Confirm the rename (Phase 3) didn't break the Overview map's existing Copy/Paste/Duplicate — full regression pass on that feature, since it's the same component under a new name/import.

### Conventions (same as every previous batch)

- Work on `staging`. Commit message references BL-071. `npm version minor --no-git-tag-version` (new backlog item, no letter suffix).
- If any file name, field name, or existing handler above doesn't match what you find in the real code, that's fine — the snippets above are grounded in a fresh read of the actual repo, but adjust to whatever's actually there rather than treating them as gospel.
- Check off BL-071 in `BACKLOG.md` with a short completion note once done, same as every prior item.
