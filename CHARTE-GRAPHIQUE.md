# Bartender Track and Trace Simulator — Design Charter

> Working document. See `CLAUDE-CONCEPT.md` for the product spec. Palette, typography, and logo usage decided 2026-08-24 in Cowork, inspired by Supplier Connect (`../supplier-portal`) — see the style guide preview built for this decision: `style-guide.html` (also published as a Cowork Artifact for review).

## Status

Name, palette, typography, and logo usage decided. Component conventions decided. Full screen mockups not yet built — will follow once BL-003 (core entity model) is settled.

## Name

**Bartender Track and Trace Simulator** — decided 2026-08-24 (see `BACKLOG.md` BL-000). Repo `collector-simulator` remains the technical identifier only, same pattern as ChefCellar's repo `winecellar`.

## Logo

Reuses the official **BarTender** mark **verbatim, unaltered** — same asset as Supplier Connect (`supplier-portal/public/bartender-logo.png`), copied into this repo at `public/brand/bartender-logo.png`. It's a trademarked mark; only the surrounding design changes, never the icon itself. Usage mirrors Supplier Connect's `BartenderLogo.tsx` pattern: icon + separate "BarTender" wordmark in real text (not baked into the image), plus a small condensed tag reading "Track & Trace Simulator" next to it — see the style guide header mockup.

## Color palette

**Decided 2026-08-24** — explicit direction from Luc: **orange and white as the main colors**, **Seagull navy as contrast** (buttons, highlights). Both brand colors are reused verbatim from the existing BarTender/Seagull palette already live in Supplier Connect (`tailwind.config.ts` / `globals.css` — tokens `oc-orange` / `oc-navy`, also aliased there as `tt-orange` / `tt-navy`), so this app stays visibly part of the same product family. What changes from Supplier Connect is **which color carries the interaction**: there, orange is the button/action color; here, that role moves to navy, and orange is reserved for brand presence (logo, eyebrows, active nav, accents) — a deliberate swap so the two tools read as related but distinguishable at a glance.

| Token | Hex | Usage |
|---|---|---|
| Brand orange | `#E8472A` | Logo, section eyebrows/labels, active nav indicator, brand accents — **not** buttons |
| Seagull navy | `#0D1E2C` | Primary buttons, links, focus rings, key highlights |
| Surface (white) | `#FFFFFF` | Cards, panels, the top bar |
| Page ground | `#FAF8F4` | Warm near-white background (chosen over Supplier Connect's cooler `#F6F8FA` to sit better against orange) |
| Success | `#1E8E5A` | Device online, workflow complete, bug resolved |
| Warning | `#B4740E` | Banners only — never a status, same rule as Supplier Connect |
| Danger | `#C41E3A` | Device error, bug open — reused verbatim from Supplier Connect's crimson |
| Neutral / info | `#5B6B78` | Idle state, unlabeled/no-label items, informational |

Full token set (including dark-mode values, tints, and borders for each) is implemented in `style-guide.html` — copy those CSS custom properties directly into `globals.css` once the app is scaffolded (BL-001).

## Typography

**Decided 2026-08-24**: **IBM Plex Sans** (UI/headings) + **IBM Plex Sans Condensed** (eyebrows/labels, same role Supplier Connect gives Open Sans Condensed) + **IBM Plex Mono** (serials, device IDs, EPCs/GTINs, timestamps). Chosen over reusing Supplier Connect's Open Sans specifically for the mono face — this app is full of long serialized identifiers, and a genuine monospace treatment (tabular figures, fixed width) reads much better for that than a sans-only system. All three are Google Fonts, no licensing concern.

## Component conventions

Carried over from Supplier Connect's design system, unchanged:
- Cards: white surface, 1px border, no drop shadows, 8px radius.
- Left-accent status stripe on list rows (color = semantic state, not the brand accent).
- Buttons press with a subtle `scale(0.98)` on `:active`; disabled = 40% opacity.
- Semantic colors (success/warning/danger/info) are never reused as the brand accent, and vice versa.
- `prefers-reduced-motion` respected on all entrance/transition animations.

Changed from Supplier Connect:
- Interactive/focus color is **navy**, not orange (form focus rings, button fills, links).
- Neutral palette is warm-leaning (paired with orange) rather than cool/blue-grey.
- Dark theme included from the start (see `style-guide.html`) — a plausible fit for a simulator that could run in a control-room/NOC context, not present in Supplier Connect today.

## Reference

- `style-guide.html` in this repo — the living token + component reference (also published as a Cowork Artifact for Luc's review). Regenerate/update it whenever the palette or component conventions change, the same way it was built.
- Inspiration source: `../supplier-portal` (Supplier Connect) — `tailwind.config.ts`, `app/globals.css`, `components/ui/BartenderLogo.tsx`.

## Next steps

- Once BL-003 (core entity model) is settled, mock up the real screens (Devices, Workflows, Serialized Items, Bug Reports) using these tokens.
- Confirm with Luc whether dark mode is worth keeping as a real feature or was just exploratory here.
