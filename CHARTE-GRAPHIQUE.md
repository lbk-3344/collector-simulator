# Bartender Track and Trace Simulator — Design Charter

> Working document. See `CLAUDE-CONCEPT.md` for the product spec. Palette, typography, and logo usage originally decided 2026-08-24 in Cowork, inspired by Supplier Connect (`../supplier-portal`) — see `style-guide.html`. **Revised 2026-08-26** — typography, background, and orange's interactive role updated after a live comparison review (`design-review.html`, Cowork artifact). `style-guide.html` still reflects the *original* 2026-08-24 tokens and needs regenerating to match this revision (see `BACKLOG.md` BL-030).

## Status

Name, palette, typography, and logo usage decided (typography and background revised 2026-08-26). Component conventions decided. Full screen mockups not yet built — will follow once BL-003 (core entity model) is settled.

## Name

**Bartender Track and Trace Simulator** — decided 2026-08-24 (see `BACKLOG.md` BL-000). Repo `collector-simulator` remains the technical identifier only, same pattern as ChefCellar's repo `winecellar`.

## Logo

Reuses the official **BarTender** mark **verbatim, unaltered** — same asset as Supplier Connect (`supplier-portal/public/bartender-logo.png`), copied into this repo at `public/brand/bartender-logo.png`. It's a trademarked mark; only the surrounding design changes, never the icon itself. Usage mirrors Supplier Connect's `BartenderLogo.tsx` pattern: icon + separate "BarTender" wordmark in real text (not baked into the image), plus a small condensed tag reading "Track & Trace Simulator" next to it — see the style guide header mockup.

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

### Device states — added 2026-08-28

Four states, each driving the color of a Device's marker icon (Overview map) and its status badge (Devices list, `BACKLOG.md` BL-042 to BL-047). New dedicated tokens — not a direct inline reuse of `--success`/`--danger`, so they can be tuned independently later — add to `app/globals.css` alongside the existing semantic tokens.

Light mode:
```css
--device-off:       #93A0A6; /* = --ink-3 */
--device-active:    #1E8E5A; /* = --success */
--device-automated: #63B88A; /* lighter, less saturated green than --device-active */
--device-problem:   #C41E3A; /* = --danger */
```

Dark mode (both the `@media (prefers-color-scheme: dark)` block and `:root[data-theme="dark"]`):
```css
--device-off:       #6A7880; /* = --ink-3 dark */
--device-active:    #4ADE94; /* = --success dark */
--device-automated: #8FE3B0; /* lighter than --device-active dark */
--device-problem:   #FF6B7F; /* = --danger dark */
```

| State | Meaning | Color |
|---|---|---|
| Off | Not configured yet | `--device-off` (dark gray) |
| Active | Configured, ready, not in a workflow | `--device-active` (green) |
| Automated | Configured, sending data through a running workflow | `--device-automated` (lighter green) |
| Problem | Configured, in a workflow, but that workflow is stopped/has a problem | `--device-problem` (red) |

Applied as the marker icon's `color` on the map (`ReadPointIcon` already renders with `currentColor`, so wrapping it in an element with the state color as `color` is enough — no icon-level change needed) and as a small colored dot + label on the Devices list table.

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

### Devices list page — added 2026-08-28

Same table pattern as `UsersTable.tsx`/`BugReportsTable.tsx` — a `.panel`-wrapped `<table>`, header row in `--ink-3` uppercase-small per existing convention. Columns: icon+type, Name (+ Collector ID beneath in `--ink-3` small text, mirroring the site-card's name+meta pattern), Site, State (colored dot + label per the token table above), Workflow (name, or "—" in `--ink-3`), row actions (Edit, Delete). "+ Add device" button top-right of the page, same placement/style as other list-page primary actions.

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
- Once BL-003 (core entity model) is settled, mock up the real screens (Devices, Workflows, Serialized Items, Bug Reports) using these tokens.
- Confirm with Luc whether dark mode is worth keeping as a real feature or was just exploratory here.
