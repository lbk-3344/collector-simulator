# Read-point icons — integration notes

Source of truth: `manifest.json` in this folder. Icon codes match `GET /reference/read-point-types`.

1. Copy `svg/` and `react/ReadPointIcon.jsx` into the app's icon directory (suggested: `src/icons/read-point/`).
2. Import `ReadPointIcon` and key it off the read-point `type` field — never switch on labels or array index.
3. Never set a stroke color inside the SVG; icons inherit `currentColor` so status/row color styling stays with the row.
4. Unknown or newly added type codes must fall through to `SIMPLE_READER` (already the component default).
5. Render at 20px or larger; below 24px use `strokeWidth={3.5}`.
6. `svg-tiled/` is for docs and marketing only — do not use tiled variants inside product UI.
