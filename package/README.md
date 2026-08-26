# Read-Point Type Icons

Icon set for the 13 data-collector / read-point types returned by `GET /reference/read-point-types`.

## Contents

| Path | What it is |
| --- | --- |
| `svg/` | Bare glyphs, no background. **Use these in the app.** |
| `svg-tiled/` | Same glyphs on a white rounded tile — docs, marketing, cards. |
| `read-point-icons.sprite.svg` | All glyphs as `<symbol>`s, ids `rp-<slug>` (underscores become hyphens). |
| `react/ReadPointIcon.jsx` | Drop-in React component keyed by API code. |
| `manifest.json` | Machine-readable index: code, label, category, description, file paths. |
| `CLAUDE.md` | Integration rules for Claude Code. |

## Design rules

- 64&times;64 viewBox, 3px stroke, round caps and joins, no fills, front elevation, no perspective.
- Everything inherits `currentColor` — set color on the parent; never hardcode a hex in a glyph.
- Minimum render size 20px. At 24px and below raise the stroke to 3.5px (the React component does this automatically).
- `SIMPLE_READER` is the intentional fallback for unknown or new type codes.

## Usage — React

```jsx
import ReadPointIcon from '@/icons/read-point/ReadPointIcon';

<ReadPointIcon type={readPoint.type} size={24} title={readPoint.typeLabel} />
```

Status color comes from the surrounding row, not the icon:

```jsx
<span style={{ color: statusColor }}>
  <ReadPointIcon type={readPoint.type} size={24} />
</span>
```

## Usage — sprite

```html
<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="3.5"
     stroke-linecap="round" stroke-linejoin="round">
  <use href="#rp-lift-lobby"></use>
</svg>
```

## Type codes

| Code | Label | Category |
| --- | --- | --- |
| `PORTAL` | Portal / Gate | Fixed RFID |
| `CONVEYOR` | Conveyor / Tunnel | Fixed RFID |
| `OVERHEAD` | Overhead / Ceiling Mount | Fixed RFID |
| `SHELF` | Shelf / Embedded | Fixed RFID |
| `TABLETOP` | Open Tabletop | Fixed RFID |
| `ENCLOSURE` | Shielded Enclosure | Fixed RFID |
| `DOORFRAME` | Room-to-Room (Doorframe) | Fixed RFID |
| `LIFT_LOBBY` | Floor-to-Floor (Lift Lobby) | Fixed RFID |
| `SIMPLE_READER` | Simple Reader | Fixed RFID |
| `MIDDLEWARE` | Middleware | Software |
| `MES` | Manufacturing Execution System | Software |
| `WCS` | Warehouse Control System | Software |
| `APP` | Mobile / Web Application | Software |

## Adding a new type

Draw on the 64&times;64 grid with the same 3px round-cap stroke, keeping the mark inside roughly x/y 10&ndash;54, then add the glyph to `svg/`, `READ_POINT_GLYPHS`, the sprite, and `manifest.json`. Front elevation only — no perspective, no fills, no color.
