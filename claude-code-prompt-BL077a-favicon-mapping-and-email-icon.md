# BL-077a — favicon/email icon mapping revision

## Context

BL-077 (done, v0.29.0) designed an original app mark — a solid diagonal notch
triangle + double signal arc, brand orange `#E8472A` — and wired it up in one
mapping: **orange-on-transparent** (`icon.svg`) used for *everything*,
including the browser-tab favicon; **white-on-solid-orange squircle**
(`icon-squircle.svg`) used only for the PWA home-screen icon.

Luc has now:
1. Sent a refined geometry pass on the same "direction 1d" mark (concentric
   spacing on the outer signal arc tightened up — same shapes, same colors,
   same file names). **Cowork has already installed the refreshed source
   files** at `public/icons/app/icon.svg` and `public/icons/app/icon-squircle.svg`,
   replacing the BL-077 originals. The rasterized PWA sizes
   (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) were refreshed
   too — those don't need touching.
2. Asked for a **different icon-to-usage mapping** than BL-077 shipped with,
   verbatim: *"prepare the prompt for claude code to create the favicon wiht
   the version white on orange background, and the icon in emails or in the
   top menu bar with the Orange on transparent version."*

So the mapping is now:

| Usage | Treatment | Source |
|---|---|---|
| **Favicon** (browser tab) | White on orange squircle | `icon-squircle.svg` |
| Top menu bar / login / pending-approval screen (inline UI) | Orange on transparent | `icon.svg` |
| **Email header (new)** | Orange on transparent | `icon.svg` |

Only the favicon changes treatment. Inline UI stays as BL-077 built it, just
needs its rasterized asset refreshed to the new geometry. Email is a new
usage location that didn't exist before.

Current state of the files this touches, so there's no guessing:

**`public/icons/app/`** (as of the Cowork install just now):
`icon.svg`, `icon-squircle.svg` (refreshed sources), `favicon-16.png` /
`favicon-32.png` / `favicon-48.png` (still the **old orange-on-transparent**
rasterizations, refreshed geometry but not yet repurposed), `favicon.ico`
(**stale** — BL-077's original orange-on-transparent bundle, not yet
regenerated), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` (squircle,
current). `public/favicon.ico` is a root-path mirror of the same stale file.

**`app/layout.tsx`** — `metadata.icons`:
```ts
icons: {
  icon: [
    { url: "/icons/app/icon.svg", type: "image/svg+xml" },
    { url: "/icons/app/favicon-32.png", sizes: "32x32", type: "image/png" },
    { url: "/icons/app/favicon-16.png", sizes: "16x16", type: "image/png" },
  ],
  apple: [{ url: "/icons/app/apple-touch-icon.png", sizes: "180x180" }],
},
manifest: "/site.webmanifest",
```

**`components/AppShell.tsx`**, `app/(auth)/login/page.tsx`,
`app/(auth)/auth/pending/PendingPage.tsx`, `components/ui/BartenderLogo.tsx`
all render `<Image src="/brand/app-icon.png" .../>` — a flattened PNG of the
orange-on-transparent treatment (`next/image` isn't wired for local SVG
sources in this app, hence the pre-flattened PNG). It's currently rasterized
from the *old* BL-077 geometry.

**Email**: three HTML-producing functions exist today, none of them include
any icon/branding image yet:
- `lib/email.ts` → `announcementEmailHtml()` (BL-075) — the only one that
  already handles an image, but that's the *announcement's own* optional
  uploaded picture, unrelated to this.
- `scripts/_bugs-lib.ts` → `startEmail()` and `resolvedEmail()` (BL-010) —
  plain text bodies, footer is just `${APP}` (a string constant), no image at
  all.

`scripts/_bugs-lib.ts` already does `import { sendEmail } from "../lib/email"`,
so adding a second named export to `lib/email.ts` and importing it there is a
one-line change.

## Task 1 — Favicon: switch to white-on-orange

1. Repurpose the current orange-on-transparent favicon rasterizations rather
   than deleting them — they're still useful as a generic small orange mark
   (Task 3 needs exactly this). Rename:
   - `public/icons/app/favicon-16.png` → `public/icons/app/mark-16.png`
   - `public/icons/app/favicon-32.png` → `public/icons/app/mark-32.png`
   - `public/icons/app/favicon-48.png` → `public/icons/app/mark-48.png`
2. Rasterize `public/icons/app/icon-squircle.svg` (white on orange) at
   16×16, 32×32, 48×48, and save those as the **new**
   `public/icons/app/favicon-16.png` / `favicon-32.png` / `favicon-48.png`.
   Use whatever's already in this repo's toolchain for SVG rasterization
   (sharp/resvg/a headless browser — your call, no new dependency needed if
   one's already available; `cairosvg` was used from the Cowork side but
   there's no reason to add a Python dependency to this repo for it).
3. Rebuild `public/icons/app/favicon.ico` as a proper multi-size ICO
   (16/32/48 bundled) from those three new white-on-orange PNGs, replacing
   the stale BL-077 one. Re-mirror it to `public/favicon.ico`.
4. Update `app/layout.tsx`'s `metadata.icons.icon` array. **Important
   gotcha**: leaving `icon.svg` (orange-on-transparent) in that array will
   make most browsers prefer it over the PNG/ICO fallbacks, silently
   defeating the white-on-orange switch — Chrome and Firefox both favor an
   `image/svg+xml` icon entry when one is listed. Swap that entry to
   `icon-squircle.svg` instead, so the vector favicon matches the PNG/ICO
   ones:
   ```ts
   icon: [
     { url: "/icons/app/icon-squircle.svg", type: "image/svg+xml" },
     { url: "/icons/app/favicon-32.png", sizes: "32x32", type: "image/png" },
     { url: "/icons/app/favicon-16.png", sizes: "16x16", type: "image/png" },
   ],
   ```
   (`apple` and `manifest` stay as-is — the PWA/home-screen icon was already
   squircle and isn't changing.)

## Task 2 — Inline UI: keep orange-on-transparent, just refresh the asset

No mapping change here, no wiring change. `public/brand/app-icon.png` (the
flattened PNG `AppShell.tsx`/login/pending/`BartenderLogo.tsx` all point at)
was rasterized from the *old* BL-077 `icon.svg` geometry — regenerate it from
the refreshed `public/icons/app/icon.svg` at the same resolution as before
(256×256, transparent background) so it picks up the tightened arc spacing.
Same file path, same callers, nothing else to touch.

## Task 3 — New: icon in transactional emails, orange-on-transparent

Add a small brand mark to the top of all three outbound HTML email bodies.

1. In `lib/email.ts`, add a helper that returns the mark as an `<img>` tag
   with an inline base64 `data:` URI — same self-contained pattern
   `announcementEmailHtml()` already uses for the announcement's own image
   (no dependency on the app being publicly reachable, nothing external for
   an email client to fetch). Source the base64 from
   `public/icons/app/mark-32.png` (the orange-on-transparent 32×32 raster
   from Task 1) — read and encode it in a small build step, or inline the
   base64 string directly as a constant, whichever fits this codebase's
   existing conventions better (**your call** — `announcementEmailHtml`'s
   image is a runtime DB value so it doesn't set a precedent either way for
   *how* a static asset like this should be embedded).

   Something in this shape:
   ```ts
   const EMAIL_MARK_DATA_URI = "data:image/png;base64,..."; // from mark-32.png

   export function emailMarkHtml(): string {
     return `<img src="${EMAIL_MARK_DATA_URI}" width="28" height="28" alt="" style="display:block;margin-bottom:16px;" />`;
   }
   ```
2. Prepend `emailMarkHtml()` to `announcementEmailHtml()`'s returned markup,
   above the announcement's own optional image/title.
3. Export it and use it the same way in `scripts/_bugs-lib.ts`'s
   `startEmail()` and `resolvedEmail()` — add `emailMarkHtml` to the existing
   `import { sendEmail } from "../lib/email"` line, prepend it to both
   templates' HTML.
4. Judgment call, flagged rather than dictated: keep it small (~28px) and
   top-left, above the "Hi," greeting — this is a header mark, not a hero
   image. Adjust if it looks off once you can actually see a rendered email.

## Docs to update

- **`CHARTE-GRAPHIQUE.md`**, "App icon / favicon" section — update the
  "Orange on transparent... used inline throughout the app... and as the
  favicon" line: favicon is now white-on-orange, orange-on-transparent is
  inline-UI-and-email only. Update the file listing for the `mark-16/32/48.png`
  rename and the new favicon source (`icon-squircle.svg` for the vector
  favicon). Add email to the list of places the mark appears.
- **`CLAUDE-CONCEPT.md`** §13 decision log — short dated entry: mapping
  revised (favicon → white-on-orange, inline UI unchanged, email added),
  geometry refined by Luc.
- **`BACKLOG.md`** — new `BL-077a` under the existing "App icon / favicon"
  section, `[x]` with a completion note once built (mirror BL-077's note
  style: what changed, file renames, wiring touched, verification done).

## Versioning

Letter-suffix item off an existing feature → `npm version patch --no-git-tag-version`, per `CLAUDE.md`.

## Verification

- `npx tsc --noEmit` at minimum.
- A real `npm run build` if it runs clean in your environment (Cowork's own
  sandbox couldn't finish one here — an unrelated Prisma-checksum network
  issue specific to that sandbox — but that's not expected to reproduce on
  your machine).
- Visual check in a running dev server: browser tab shows the white-on-orange
  favicon; topbar/login/pending still show orange-on-transparent with the
  refreshed geometry; render one of the three email HTML strings (e.g. call
  `startEmail()`/`announcementEmailHtml()` directly, or trigger a real send if
  `RESEND_API_KEY` is set) and confirm the mark shows up and isn't oversized.
