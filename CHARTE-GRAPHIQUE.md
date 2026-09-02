# Bartender Track and Trace Simulator — Design Charter

> Working document. See `CLAUDE-CONCEPT.md` for the product spec. Palette, typography, and logo usage originally decided 2026-08-24 in Cowork, inspired by Supplier Connect (`../supplier-portal`) — see `style-guide.html`. **Revised 2026-08-26** — typography, background, and orange's interactive role updated after a live comparison review (`design-review.html`, Cowork artifact). `style-guide.html` still reflects the *original* 2026-08-24 tokens and needs regenerating to match this revision (see `BACKLOG.md` BL-030).

## Status

Name, palette, typography, and logo usage decided (typography and background revised 2026-08-26). Component conventions decided. Full screen mockups not yet built — will follow once BL-003 (core entity model) is settled.

## Name

**Bartender Track and Trace Simulator** — decided 2026-08-24 (see `BACKLOG.md` BL-000). Repo `collector-simulator` remains the technical identifier only, same pattern as ChefCellar's repo `winecellar`.

## Logo — superseded 2026-09-02 (BL-077), see "App icon / favicon" below

~~Reuses the official **BarTender** mark **verbatim, unaltered**~~ — this app no longer does this. It originally copied the official mark in at `public/brand/bartender-logo.png` (same asset as Supplier Connect), on the reasoning that "it's a trademarked mark; only the surrounding design changes, never the icon itself." Luc decided 2026-09-02 to replace it everywhere with an original mark instead (see below) rather than keep reusing BarTender's own trademarked artwork as this app's own icon. The layout pattern this section originally described — icon + a separate "BarTender" wordmark in real text, plus a small condensed "Track & Trace Simulator" tag — is unchanged; only the icon image itself changed.

## App icon / favicon — added 2026-09-02 (BL-077), mapping revised 2026-09-02 (BL-077a)

An original mark, not the BarTender logo: a solid diagonal notch triangle with a double signal arc continuing the same 45° axis — "direction 1d" from a set of candidates worked through in a Claude Design session (after several rougher sketches tried a more literal reuse of BarTender's own nested-bracket geometry, which read as too busy at favicon size; this direction kept only the triangular notch shape and paired it with the signal-wave motif). No BarTender artwork is traced or reproduced in it. Geometry refined once (BL-077a, tightened outer-arc spacing) — same shapes, same colors, same file names.

- **Brand orange** `#E8472A`, single-color mark. Two treatments, and **the mapping between them changed at BL-077a** — the favicon moved from orange-on-transparent to white-on-orange; everything else stayed orange-on-transparent:
  - **White on solid-orange squircle** (`public/icons/app/icon-squircle.svg`, 22% corner radius) — used as the **favicon** (BL-077a; a transparent-background favicon read as washed-out in the browser tab) and for the PWA home-screen icon (unchanged since BL-077 — a transparent PNG looks broken on most launchers).
  - **Orange on transparent** (`public/icons/app/icon.svg`) — used inline throughout the app (topbar, login, pending-approval screen) at small sizes (22–30px), and, new at BL-077a, as a small header mark on outbound transactional emails (bug-notification and announcement emails).
- **Files**: `public/icons/app/` holds the two source SVGs. Rasterized: `favicon-16/32/48.png` are now the **white-on-orange** squircle rasterizations (favicon use, BL-077a) with `favicon.ico` bundling the same three (mirrored to `public/favicon.ico` for the legacy root-path fallback); `mark-16/32/48.png` (renamed from BL-077's `favicon-*.png` at BL-077a) are the orange-on-transparent rasterizations, used as the email header mark's source; `apple-touch-icon.png` (180) and `icon-192.png`/`icon-512.png` (squircle, for `public/site.webmanifest`) are unchanged since BL-077. `public/brand/app-icon.png` is a flattened PNG of the orange-on-transparent treatment, used by `next/image` in the three inline UI spots (SVG isn't wired through this app's image loader) — refreshed at BL-077a for the geometry tweak, same file path.
- **Legibility floor**: the mark was deliberately simplified until it survived a real 16×16 favicon render — that was the hard constraint through every round of iteration, since a busier composition (a fuller echo of BarTender's own two-band bracket shape) blurred into a blob at that size.
- Wired into `app/layout.tsx` (`metadata.icons` — the SVG entry points at `icon-squircle.svg` since BL-077a, not `icon.svg`, so the vector favicon doesn't silently override the PNG/ICO white-on-orange fallbacks in browsers that prefer SVG icons; `metadata.manifest`; a `viewport.themeColor` of `#0D1E2C`) and swapped into the three places the old `bartender-logo.png` was inlined: `components/AppShell.tsx`'s topbar, `app/(auth)/login/page.tsx`, `app/(auth)/auth/pending/PendingPage.tsx`. The "BarTender." text wordmark next to it is unchanged — only the graphic mark was replaced. At BL-077a, also wired into `lib/email.ts` (`emailMarkHtml()` helper, base64-inlined from `mark-32.png`) and used by `announcementEmailHtml()` there plus `startEmail()`/`resolvedEmail()` in `scripts/_bugs-lib.ts`.

## Color palette

**Orange's role revised 2026-08-26** — still brand-first, but now carries more of the interactive surface than originally scoped on 2026-08-24. Both brand colors are reused verbatim from the existing BarTender/Seagull palette already live in Supplier Connect (`tailwind.config.ts` / `globals.css` — tokens `oc-orange` / `oc-navy`, also aliased there as `tt-orange` / `tt-navy`).

| Token | Hex | Usage |
|---|---|---|
| Brand orange | `#E8472A` | Logo, section eyebrows/labels, sidebar active-item fill, avatar-menu item hover, category badges (e.g. `FIXED_RFID`/`SOFTWARE`), secondary/ghost buttons |
| Seagull navy | `#0D1E2C` | Primary buttons, links, focus rings, key highlights |
| Surface (white) | `#FFFFFF` | Cards, panels, the top bar |
| Page ground | `#F4F4F5` | **Revised 2026-08-26** — plain light gray, replacing the original warm `#FAF8F4`. No hue borrowed from either brand color; separation from card surface comes from the 1px card border, same as before. |
| Success | `#1E8E5A` | Device online, workflow complete, bug resolved |
| Warning | `#B4740E` | Banners only — never a status, same rule as Supplier Connect |
| Danger | `#C41E3A` | Device error, bug open — reused verbatim from Supplier Connect's crimson |
| Neutral / info | `#5B6B78` | Idle state, unlabeled/no-label items, informational |

**Orange vs. semantic color — rule unchanged:** status colors (success/warning/danger/neutral above) are never replaced by orange, even where orange now appears more often elsewhere. A device's online/offline/error state stays semantic-colored; orange marks *category* and *navigation/interaction*, not *state*.

Full token set (dark-mode values, tints, borders) is implemented in `style-guide.html` — **this file still reflects the pre-2026-08-26 tokens and needs regenerating** before BL-017's `globals.css`/`tailwind.config.ts` port is safe to redo from it (see `BACKLOG.md` BL-030).

## Typography

**Revised 2026-08-26** (originally IBM Plex Sans/Condensed/Mono, decided 2026-08-24): **Inter** (UI/headings, and eyebrows/labels via uppercase + letter-spacing rather than a separate condensed face) + **JetBrains Mono** (serials, device IDs, EPCs/GTINs, timestamps — kept a genuine monospace with tabular figures for the same reason Plex Mono was originally chosen).

**Self-hosted via real npm packages**, not a Google Fonts CDN link — needed both so the app has zero external font requests in production, and so `/design-sync` (Claude Design ↔ Claude Code) reads them as real, declared dependencies when the repo is linked:

```bash
npm install @fontsource/inter @fontsource/jetbrains-mono
```

- `@fontsource/inter` — v5.3.0, OFL-1.1 license
- `@fontsource/jetbrains-mono` — v5.3.0, OFL-1.1 license

Usage (Next.js App Router, in the root layout or `globals.css`):

```ts
// app/layout.tsx
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
```

```css
/* globals.css */
:root {
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

*(Alternative, zero-extra-dependency route: Next.js's built-in `next/font/google` self-hosts the same two families automatically at build time with no separate npm install. Either works — the explicit Fontsource packages above are the pick here specifically so the fonts show up as real `package.json` dependencies once this repo is linked to Claude Design.)*

## Component conventions

Carried over from Supplier Connect's design system, unchanged:
- Cards: white surface, 1px border, no drop shadows, 8px radius.
- Left-accent status stripe on list rows (color = semantic state, not the brand accent).
- Buttons press with a subtle `scale(0.98)` on `:active`; disabled = 40% opacity.
- Semantic colors (success/warning/danger/info) are never reused as the brand accent, and vice versa.
- `prefers-reduced-motion` respected on all entrance/transition animations.

Changed from Supplier Connect:
- Interactive/focus color is **navy**, not orange (form focus rings, primary button fills, links).
- **Revised 2026-08-26**: orange now also carries the sidebar active-item fill (a filled pill, not just a thin indicator line), avatar-menu item hover state, category badges, and secondary/ghost buttons — see the color palette table above.
- Neutral palette is now a plain light gray (`#F4F4F5`) rather than warm-leaning or cool-blue-grey.
- Dark theme included from the start (see `style-guide.html`) — a plausible fit for a simulator that could run in a control-room/NOC context, not present in Supplier Connect today.

### Inline feedback ("snacks") — revised 2026-08-27

**Decided 2026-08-27**, replacing the plain colored-text pattern used for save/error/test-connection results (first noticed on Settings → Bartender Connection, e.g. `BartenderConnectionTab.tsx`'s "Saved." and "Connected — found N locations." lines, plus the bare `.error-banner` used there and on the Users tab and login page). Luc's explicit ask: a filled, rounded-rectangle "snack" — solid semantic-color background, not the existing light tint — with text color chosen per-color for contrast, instead of colored text sitting directly on the page/card background.

- New component class `.snack`, with modifiers `.snack-success` / `.snack-danger` / `.snack-warning` (no `.snack-info` needed yet — nothing currently uses neutral/info for this pattern).
- Shape: rounded rectangle, same radius as the app's standard `--radius` (8px, matching cards/buttons) — a pill (999px) is *not* the intent here, that's reserved for the existing `.chip`/`.badge` components. Padding roughly `10px 14px`, `inline-flex`, small gap for an optional leading icon (checkmark / triangle / x — optional, not required for v1).
- Backgrounds are the **solid** semantic colors already defined above (not the `-tint` variants used by `.chip`/`.error-banner`): success `#1E8E5A`, danger `#C41E3A`, warning `#B4740E`.
- Text color is picked per background for WCAG AA contrast (4.5:1), not a single fixed choice:
  - `.snack-success` (`#1E8E5A`) → **Seagull navy** `#0D1E2C` (the app's existing dark-text token) — white text on this green falls just under AA (~4.1:1).
  - `.snack-danger` (`#C41E3A`) → **white** `#FFFFFF` — navy text on this red fails AA (~3.6:1).
  - `.snack-warning` (`#B4740E`) → **Seagull navy** `#0D1E2C` — white text on this amber fails AA (~3.9:1).
- Replaces the old pattern everywhere it currently appears: `BartenderConnectionTab.tsx` (Saved / Test connection result), `.error-banner` on `UsersTable.tsx` and `(auth)/login/page.tsx`, and the equivalent message in `BugReportModal.tsx` — one consistent component instead of four ad-hoc instances. The existing tint-based `.chip-*` classes (status badges on list rows, e.g. device online/offline) are untouched — this only replaces the plain-text/banner feedback pattern, not the tag/badge system.

### Site selector card — added 2026-08-27

First of the four Overview top cards, replacing what was previously a `.stat-card`. New class `.site-card`: `.panel`-style container (surface + border + `--radius`), flex row layout — a large world/globe icon on the left (~40-44px, line-art style consistent with the existing `ReadPointIcon` set), and on the right a stacked text block: the selected site's **name** large and bold (roughly the size of `.stat-card .n`, ~20-22px), with city/state/country beneath it in small muted text (~11-12px, `var(--ink-2)`, comma-separated, omitting any missing field rather than showing empty commas). The name is clickable — hover/focus shows it's interactive (underline or a small chevron) — and opens a dropdown (reuse the existing avatar-menu/`.user-menu-item` dropdown pattern: a small elevated panel, one row per site, current selection indicated) listing every other Location; picking one closes the dropdown and updates the card.

### Location map card — added 2026-08-27

Replaces the previous placeholder `.panel` beneath the KPI row. Uses the existing `.panel` container styling, sized to fill the available content width and to the largest height the viewport reasonably allows (responsive — recalculates on window resize, no fixed aspect ratio forced on the floor-plan image beyond what's needed to avoid distortion).

Inside, the floor-plan image fills the card (`object-fit: contain`, so nothing crops), wrapped in a pan/zoom transform layer. A floating control widget sits `position: absolute` in the card's bottom-right corner (small gap from the edges, elevated with a subtle shadow matching `--shell-shadow`, `--radius`-rounded, `--surface` background): three icon buttons — zoom in (+), zoom out (–), and a move/pan toggle — sized and styled consistently with the existing icon-only sidebar nav buttons (BL-031) rather than full `.btn`s, since they're a persistent chrome control, not a primary action.

Zone and Device markers are small icon badges positioned absolutely within the transform layer at their `{x, y}` pixel coordinates (scaled to the image's natural size so they stay correctly placed at any zoom level) — Device markers reuse `ReadPointIcon`; a Zone marker (no existing icon set yet) can start as a simple labeled dot/pin, refined later if it needs more.

No-floor-plan state: when the selected site has `hasMap: false`, the card shows a centered placeholder (reusing the existing `.placeholder` pattern) rather than attempting to render a missing image.

### Device states — added 2026-08-28, revised 2026-09-01 (BL-074)

Four states, each driving the color of a Device's marker icon (Overview map) and its status badge (Devices list). Renamed and revised 2026-09-01 per Luc's direct request: `Active`→**Ready**, `Automated`→**Active** (matches how Luc actually talks about them), `Problem` retired (a stopped-workflow Device now just reads Ready), and a new manual **Offline** state added — see `CLAUDE-CONCEPT.md` §15.3 for the full precedence logic. New dedicated tokens — not a direct inline reuse of `--success`/`--danger`, so they can be tuned independently later — live in `app/globals.css` alongside the existing semantic tokens.

Light mode:
```css
--device-pending: #93A0A6; /* = --ink-3, unchanged (was --device-off) */
--device-ready:   #1E8E5A; /* = --success, unchanged (was --device-active) */
--device-active:  #1E8E5A; /* = --success — same shade as Ready now, was the lighter --device-automated */
--device-offline: #C41E3A; /* = --danger — was --device-problem's "workflow stopped" meaning, now "manually offline" */
```

Dark mode (both the `@media (prefers-color-scheme: dark)` block and `:root[data-theme="dark"]`):
```css
--device-pending: #6A7880;
--device-ready:   #4ADE94;
--device-active:  #4ADE94;
--device-offline: #FF6B7F;
```

| State | Meaning | Color |
|---|---|---|
| Pending | Not configured yet | `--device-pending` (dark gray) |
| Ready | Configured, published, not currently in a running workflow (whether unattached or attached to a stopped one) | `--device-ready` (green) |
| Active | Configured, published, sending data through a **running** workflow | `--device-active` — same green as Ready, distinguished by a **pulsing animation** (see below), not a lighter shade |
| Offline | Manually turned off from Ready (new toggle) — heartbeat paused, no manual send | `--device-offline` (red) — red no longer means "workflow stopped" |

Applied as the marker icon's background/`color` on the map and as a small colored dot + label on the Devices list table, exactly as before — only the token names and the Active state's treatment changed.

**Active pulse animation** — a looping ring behind the marker/dot, not a static color, to read as "live":

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

Both host elements need `position: relative` for the `::after` ring to anchor correctly — the map marker already has it inline; the Devices list's `.device-state-dot` needs it added if not already present.

### Device type palette (Edit mode) — added 2026-08-28

A floating panel, anchored top-left of the Location map card (mirrors the bottom-right zoom/pan widget's `--surface`/`--shell-shadow`/`--radius` treatment, just top-left instead), shown only while Edit mode is on. Lists all 13 `READ_POINT_TYPES` as a small grid of icon buttons (`ReadPointIcon` at ~28px, `--ink-2` stroke, label as a `title` tooltip) — each is a drag source. A short label at the panel's top: "Drag a device onto the map".

### Device config screen — added 2026-08-28

A modal, same structural pattern as `BugReportModal.tsx` (centered overlay, `.panel`-styled card, close button top-right) — used both from map Edit mode (dropping/clicking a device) and the Devices list page (BL-047). Fields, top to bottom: Collector ID, Name, Read point type (icon + label, read-only when pre-set by a palette drag, otherwise a select), Site (read-only when pre-set by a map drop, otherwise a select — the Devices-list "+ Add device" case), Model, Vendor, Config version, Heartbeat (enabled toggle + timeout seconds, one row), Attributes (repeatable key/value row pairs with a small "+ Add attribute" link), Workflow (select: "None" + existing Workflows). Primary button "Save" (navy, `.btn-primary`), secondary "Cancel" (`.btn-secondary`).

**Revised 2026-08-28 (BL-049/BL-050/BL-051)** — three additions to the screen above, all icon-first per Luc's explicit ask that the form read as self-explanatory without needing a legend.

**Collector ID suggestion** — a small ghost icon button sits beside the Collector ID input: a circular-arrow "regenerate" glyph (20px, two curved arrows forming a loop, `--ink-2` stroke, same weight as the modal's close-button icon). Clicking it re-runs the `{site}-{TYPE}-{NN}` suggestion and replaces the field's current value — a way to pull a fresh number without leaving the keyboard. The field itself is never read-only; the icon is a convenience, not a lock.

**Channels** — a `field-block` labeled "Channels" with a small antenna/signal glyph (three ascending arcs over a dot, 16px, `--ink-2`) beside the label, same "icon marks what this section is" convention as the modal's own big top-left type icon. Each Channel is one row:
- Its `CH1`/`CH2`… id, shown as small `--ink-3` mono text (`var(--font-mono)`), not editable.
- A **Type** toggle: two square icon buttons side by side (new `.icon-toggle`/`.icon-toggle-btn` component, ~32px, selected = navy fill + white icon, unselected = `--surface` + `--ink-2` icon and a 1px border, same interaction weight as a segmented control) — a radar-ping glyph (a center dot with two concentric arcs, reads as "detecting presence") for **Presence**, and a two-headed crossed-arrow glyph (reads as "movement/direction") for **Directional**.
- A second `.icon-toggle`, contents depending on the first: for **Presence** — an arrow entering a bracket (**First seen**), a plain dot/eye (**Present**), an arrow leaving a bracket mirrored from First seen (**Last seen**); for **Directional** — an arrow pointing down into an open tray (**Inbound**), an arrow pointing up out of a tray mirrored from Inbound (**Outbound**).
- A trash-icon remove button (`.attr-remove-btn`, reused verbatim) at the row's end, hidden/disabled when it's the only Channel left.
A "+ Add channel" link below the rows, same styling as "+ Add attribute" (`.attr-add-link`).

**Publish to platform action** — the modal-foot's primary button, shown instead of a plain "Save" whenever the Device isn't yet published: an upload-to-cloud glyph (a rounded cloud outline with an upward arrow through it, 18px) to the left of the label "Publish to platform", still `.btn-primary` (navy fill). A second, `.btn-secondary`-styled "Save draft" (no icon, plain secondary action) sits beside it. Once published, the foot reverts to a single `.btn-primary` "Save", no icon — publishing is the one moment that needs a distinct, icon-marked call to action; routine saves after that don't.

**Live state pill** — reuses the Devices list's existing dot+label state treatment (`.device-state*` classes), placed inline next to the modal's title (to the right of the big type icon, before the close button), so the current Off/Active/Automated/Problem status is visible the instant the modal opens.

**Revised 2026-08-29 (BL-053/BL-054)** — Publish/Save now make a real platform call (`CLAUDE-CONCEPT.md` section 15.8); two additions to the screen above to make sync health visible without adding a fifth device state:

- **Sync error banner** — reuses the existing `.error-banner` component verbatim (no new class), placed at the top of the modal body, above the fields. Shown whenever `lastSyncError` is set on the Device being edited: the plain-language message from the failed `POST /collectors/register` call (e.g. "Bartender rejected this device: locationId TTMEMBASE is not bound to this API key."), so a sync failure is visible the moment the modal opens, not just at the instant it happened. Cleared the next time a sync succeeds; a Device that's never been published simply never shows it.
- **Per-Channel reconciliation flag** — when the most recent successful publish/resync reported a `CONFLICT` or `BROKEN` mapping issue for a specific Channel (`platformReconciliation`), that Channel's row gets a small inline warning triangle (14px, `--warning` for `CONFLICT`, `--danger` for `BROKEN`) right after its id, with the platform's own short status word as a `title` tooltip — informational only, doesn't block editing or re-saving that row.
- **Delete confirmation, published Device only** — no new modal; still the existing native `confirm()` pattern (`app/(app)/devices/page.tsx`), just a second sequential call after the existing "Delete permanently?" one: *"Also deregister it from the real Bartender platform? This removes its Zone mappings there and can't be undone."* Answering either way still deletes the local row.

**Revised 2026-08-31 (BL-072, `CLAUDE-CONCEPT.md` 15.10)** — a third small addition, same slot as the two above (top of modal body, near the Heartbeat field-block): a **heartbeat-health line**, not a new banner component — plain `.note` text ("Last heartbeat: ONLINE, 34s ago") when `lastHeartbeatStatus` is set, or the same `.error-banner` treatment as the sync error banner above (reused, not forked) when `lastHeartbeatError` is set. Nothing shown for a Device that's never had a heartbeat sent (unpublished, or heartbeat disabled) — same "never shows until there's something to show" posture as the sync banner.

### Devices list page — added 2026-08-28

Same table pattern as `UsersTable.tsx`/`BugReportsTable.tsx` — a `.panel`-wrapped `<table>`, header row in `--ink-3` uppercase-small per existing convention. Columns: icon+type, Name (+ Collector ID beneath in `--ink-3` small text, mirroring the site-card's name+meta pattern), Site, State (colored dot + label per the token table above), Workflow (name, or "—"), row actions (Edit, Delete). "+ Add device" button top-right of the page, same placement/style as other list-page primary actions.

**Revised 2026-08-31 (BL-065)** — row actions gain a third icon, **Duplicate**, sitting between Edit and Delete: two-overlapping-squares glyph, same `.row-icon-btn` treatment as Delete (ghost — `--ink-2` icon, no fill at rest, `--surface-2` hover background), not the solid-orange treatment reserved for Edit. `aria-label`/`title` "Duplicate".

### Context menu (right-click) — added 2026-08-31

First context menu in the app (`CLAUDE-CONCEPT.md` section 15.9, BL-066) — right-clicking a Device marker on the Overview map while Edit mode is on. A small floating panel, same elevation language as the map's own zoom/pan and Edit-mode-palette widgets (`--surface` background, 1px `--border-strong`, `--radius`, `--shell-shadow`), positioned `position: fixed` at the cursor's client coordinates (clamped so it never renders off-screen past the viewport edge). Three rows, stacked, no header:

- **Copy** — a copy/clipboard glyph (two overlapping rounded rectangles, same family as the Devices-list Duplicate icon above), 16px, `--ink-2`.
- **Paste** — a clipboard-with-plus glyph, 16px. Greyed at 40% opacity (matching the app's existing disabled-button convention) and non-interactive whenever nothing has been copied yet.
- **Duplicate** — the same two-overlapping-squares glyph as the Devices-list row action, 16px.

Each row: icon + label, `12.5px` text, `~8px 12px` padding, full-width hover state (`--surface-2` background) — same interaction weight as `.user-menu-item` (`UserMenu.tsx`), which this component's hover/spacing/typography is copied from wholesale rather than invented fresh. Dismisses on an outside click, `Escape`, or immediately after any row is clicked — same lifecycle as `UserMenu.tsx`'s own open/close `useEffect` pattern.

**Second call site, added 2026-08-31 (`CLAUDE-CONCEPT.md` 16.9, BL-071)**: right-clicking a Feed Node on the Workflow canvas opens the same panel — Copy/Paste/Duplicate an Item Feed instead of a Device. Nothing about the panel itself is Device-specific, so `components/DeviceContextMenu.tsx` is renamed to generic `components/ContextMenu.tsx` (component `ContextMenu`) rather than forked — one component, two call sites (`LocationMapCard.tsx`'s marker menu, `WorkflowEditor.tsx`'s Feed Node menu).

**Optional 4th row — "Remove from workflow", added 2026-08-31 (v0.23.1)**: the Feed Node menu adds a destructive row below a hairline separator (`.ctx-menu-sep`, 1px `--border-strong`, `4px 6px` margin) — a trash glyph + label in `--danger`, `--danger-tint` hover, mirroring `.user-menu-item.danger`. Rendered only when the `ContextMenu` gets an `onDelete` prop (the Overview-map marker menu doesn't pass one, so it stays 3 rows). Removing a Feed Node deletes only that canvas placement + its feed links, never the shared Item Feed definition — a `useDialog().confirm()` (warning variant, "Remove" / danger) spells that out before the `DELETE`.

### "Shared" badge (read-only indicator) — added 2026-08-31

`CLAUDE-CONCEPT.md` section 17, `BACKLOG.md` BL-068. Marks a Device/Workflow/Item Feed row or canvas node that's visible only because it's shared — not owned by the viewer, and therefore read-only. Reuses the existing tint-based `.chip` family (not the solid `.snack` component — this is a status tag, not feedback) — new `.chip-shared` modifier: `--info-tint` background, `--info` text, a small closed-padlock glyph (12px) before the label "Shared". Placed:

- **List rows** (Devices/Workflows/Item Feeds): immediately after the Name cell's primary text, same slot the existing State dot+label sits in on the Devices list — small enough not to disrupt the row's existing rhythm.
- **Canvas** (`workflow-canvas-editor.html`'s node styling): a small `.chip-shared` pinned to a Task/Feed Node's top-right corner when the whole Workflow is shared-not-owned, rather than repeating it per node — the read-only state applies to the whole canvas at once in that case.

Rows/nodes carrying this badge also get their Edit/Delete/Duplicate-as-edit/drag affordances disabled (40% opacity, `cursor: not-allowed`, matching the app's existing disabled-control convention) rather than hidden — a viewer should be able to see that an action exists and is simply not theirs to take, not wonder why a button is missing.

**Built 2026-08-31 (BL-068, v0.22.0)** — as-built, with two deliberate deviations from the sketch above:
- **Workflow canvas**: the `.chip-shared` badge sits in the editor **toolbar next to the Workflow name**, not pinned to each node — the whole canvas is read-only at once, and the toolbar is where the name/Run controls (also disabled) already are, so one badge there reads cleaner than a repeated corner tag. The device/feed **palette is hidden** entirely in read-only mode (nothing to drag), rather than shown-but-dimmed.
- **Overview map**: a shared Device's marker carries a compact corner **padlock dot** (`.map-marker-shared`, `--info` fill), not the full "Shared" pill — the pill doesn't fit a ~40px map marker. The pill is still used on the list rows exactly as described.
- List-row buttons use the native `disabled` attribute (the app's button CSS already renders that as the dimmed / `not-allowed` state) plus a "Shared with you — read-only" `title`.

**Refined 2026-08-31 (v0.22.1)** — "read-only" keeps the full detail window, it just can't be saved (so a shared item can be inspected as a model):
- On shared Devices / Item Feeds list rows the pencil becomes an **eye icon** ("View", still enabled); it opens the normal config modal in a read-only state. Delete / Duplicate stay disabled as before.
- Read-only modal state = body wrapped in `<fieldset class="modal-fields" disabled>` (greys every control at 65% and inerts the `role="button"` ProductPicker chips via `.modal fieldset.modal-fields:disabled [role="button"]{pointer-events:none}`), header reads "View …", a `.snack-info` line "Shared with you — read-only.", footer is a single **Close**. Same treatment on the workflow-canvas Flow Link / Feed Link popovers.
- New `.snack-info` (info-tint fill, info text/border) for that read-only banner.

### Admin "Shared resources" screen — added 2026-08-31

`CLAUDE-CONCEPT.md` section 17.4, `BACKLOG.md` BL-069. A new tab in Settings, alongside the existing admin-only Users tab (same gating, same tab-strip placement) — table pattern copied from `UsersTable.tsx`/`BugReportsTable.tsx` like every other list in this app. Columns: Type (Device/Workflow/Item Feed, small `.chip` tag), Name, Owner (name + email, small text under it, mirroring the Devices list's Name+Collector-ID stacked pattern), Shared (a toggle switch, not a button — this is a persistent on/off state, not an action to click through a confirmation for). No row click-through to the underlying record — this table's only interactive element is the toggle itself.

**Built 2026-08-31 (BL-069, v0.22.0)** as `components/SharedResourcesTable.tsx`, tab label "Shared resources" (4th tab, after Bug Reports). New `.toggle-switch` component in `globals.css` — 38×22px pill, `--border-strong` off / `--success` on, 18px white knob sliding 16px, `:disabled` at 50% opacity during the in-flight PATCH. One flat table (not grouped by owner — sorted by name within each type, types concatenated); the toggle flips optimistically and reverts with an error snack if the PATCH fails.

## Iconography

**Read-point type icons — integrated 2026-08-26.** A 13-icon set for the read-point/device types exposed by Bartender's `GET /reference/read-point-types` (see `CLAUDE-CONCEPT.md` section 7) — produced in a separate Claude Design session, delivered as `package/` at the repo root, and wired into the app as `components/ui/ReadPointIcon.tsx` + `public/icons/read-point/*.svg`.

Design rules (source of truth: `package/README.md` and `package/manifest.json` — keep this summary in sync if either changes):
- 64×64 viewBox, front elevation only — no perspective, no fills, line-art only.
- 3px stroke at normal sizes, bumped to 3.5px when rendered at ≤24px so the glyph doesn't thin out.
- Round line caps and joins throughout.
- Stroke color is always `currentColor` — never hardcode a color on the SVG or the React component; icons inherit the surrounding text/icon color the same way the rest of the UI does.
- Render at 20px or larger — the linework is not legible smaller than that.
- Unknown/future type codes fall back to the `SIMPLE_READER` glyph rather than rendering nothing.

Two categories, 13 codes total: **Fixed RFID** (`PORTAL`, `CONVEYOR`, `OVERHEAD`, `SHELF`, `TABLETOP`, `ENCLOSURE`, `DOORFRAME`, `LIFT_LOBBY`, `SIMPLE_READER`) and **Software** (`MIDDLEWARE`, `MES`, `WCS`, `APP`).

Usage: import the default export from `components/ui/ReadPointIcon.tsx` and pass a `type` matching one of the codes above — `<ReadPointIcon type="PORTAL" size={24} />`. The raw standalone SVGs and a combined `<symbol>` sprite are also available under `public/icons/read-point/` for any non-React usage (e.g. static marketing pages).

## App shell layout

**Revised 2026-08-27** — corrects the BL-028 layout (full-height sidebar with the page title in a separate top bar). New structure:

- **Top bar**: full-width, fixed at the very top of the viewport. Contains **only** two things — the BarTender logo + software name/wordmark on the far left, and the avatar/user menu on the far right. Nothing else lives here (no page title, no search, no breadcrumbs) — each page renders its own heading inside the content area instead.
- **Sidebar**: sits **below** the top bar, not beside it full-height — the top bar spans the full page width, and the sidebar + content area sit side by side underneath it. The sidebar carries only navigation now (no brand block — that moved to the top bar).
- **Retractable**: the sidebar toggles between a collapsed and an expanded state.
  - **Collapsed**: fixed narrow width, icon only per nav item, centered.
  - **Expanded**: icon + label per nav item, left-aligned.
  - The active nav item is the filled-orange-pill treatment from the Color palette section above, in both states (pill hugs the icon when collapsed, spans icon+label when expanded).
- See `BACKLOG.md` BL-031.

## Reference

- `style-guide.html` in this repo — the living token + component reference. **Needs regenerating** to match the 2026-08-26 revision above before further scaffolding relies on it (BL-030).
- `design-review.html` — the interactive Cowork artifact (font pairing × background toggles on a mini app shell) the 2026-08-26 revision was decided from.
- Inspiration source: `../supplier-portal` (Supplier Connect) — `tailwind.config.ts`, `app/globals.css`, `components/ui/BartenderLogo.tsx`.
- `package/README.md` — full source documentation for the read-point icon set (design rules, type-code table, "adding a new type" instructions).

## Next steps

- Regenerate `style-guide.html` from the revised tokens above, then re-run BL-017 (port tokens into `globals.css`/`tailwind.config.ts`) against the revised values — `npm install @fontsource/inter @fontsource/jetbrains-mono` as part of that same pass (BL-030).
- Rebuild the app shell to the layout above (BL-031).
- BL-003 (core entity model) is settled 2026-08-30 — see `CLAUDE-CONCEPT.md` section 16. Once the canvas is built, mock up the real screens (Devices, Workflows, Bug Reports) using these tokens. **"Serialized Items" is no longer a planned screen** — removed from the sidebar nav 2026-08-30, see below.

**Workflow canvas — Feed Node visual style, added 2026-08-30**: an Item Feed placed on the canvas is visually distinct from a Task node — big icon (kind-appropriate: e.g. the same icon language as `ReadPointIcon` but Feed-specific, not a read-point type), **solid navy (`--accent-primary`) background, white text/icon** — the inverse of a Task node's white-card/navy-header treatment. A kind badge (`NEW`/`PRESENT`/`FIXED`) sits on the Feed Node the same way Device-type badges work elsewhere. See `CLAUDE-CONCEPT.md` section 16.3/16.4 for the full interaction spec (Feed Nodes are placeable multiple times, connected to Task Channel inputs via a Feed Link edge).
- Confirm with Luc whether dark mode is worth keeping as a real feature or was just exploratory here.
