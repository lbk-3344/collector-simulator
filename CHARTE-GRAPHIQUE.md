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
