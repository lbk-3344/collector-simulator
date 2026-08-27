# Bartender Track and Trace Simulator — Backlog

Same format as ChefMate/ChefCellar: items `BL-XX`, priority P0 (MVP)/P1/P2, indicative size (XS/S/M/L). Check off (`- [x]`) once delivered, with a completion note.

## 0. Decisions to make before starting (blocking the rest of the backlog)

- [x] **BL-000** — Product name: **Bartender Track and Trace Simulator**, decided 2026-08-24. Repo stays `collector-simulator` as the technical identifier. See `CHARTE-GRAPHIQUE.md`.
- [x] **BL-001** — Framework stack confirmed by precedent 2026-08-24: Next.js (App Router, TypeScript) + Prisma + PostgreSQL + Tailwind + NextAuth v4 (`@auth/prisma-adapter`), same libraries as Supplier Connect. App skeleton built 2026-08-25 (see section 1-3 items below).
- [ ] **BL-002** — Bartender Track & Trace API scope: no API documented yet. Luc will provide specs **incrementally, one at a time**. First API to integrate still to be identified — this decides what the first end-to-end scenario can actually prove out.
- [ ] **BL-003** — Core entity model: brief specifies Devices, Workflows, and Serialized Items (with or without a label). Still to settle: device types and their configurable behavior, what a workflow step actually is and how steps chain, the serialized-item identity scheme (GTIN+serial, EPC, other), and what "with vs. without a label" changes in the flow.
- [ ] **BL-004** — Target users and access model: who uses this (Luc only, solution engineers, QA/dev team, sales demos)? Single-user tool or does it need accounts/auth?
- [x] **BL-005** — Infra fully set up 2026-08-25: GitHub repo `lbk-3344/collector-simulator` with `main` (Production) and `staging` (Preview) branches — an early mistake where only `staging` existed (making it GitHub's default and Vercel's Production Branch by mistake) was caught and fixed. Vercel project `collector-simulator` on the "ChefMate" team, Production Branch correctly set to `main`. Neon project `collector-simulator` (`lucky-lab-84095258`) with three branches: `production`, `staging`, `dev` (local-only). All env vars set in Vercel per environment, including per-environment `NEXTAUTH_URL` (branch-stable Preview URL / Production URL, not `localhost`) and matching Google OAuth redirect URIs. Local `.env` has the `dev`-branch `DATABASE_URL`, Google OAuth client, `NEXTAUTH_SECRET`, `INITIAL_ADMIN_EMAILS=lbellissard@seagullsoftware.com`. Ready for Claude Code to pick up the dev loop.

## 1. Design system (P0 — decided, implementation pending stack)

Decided 2026-08-24 in Cowork, inspired by Supplier Connect (`../supplier-portal`). Full rationale in `CHARTE-GRAPHIQUE.md`; token values and component previews in `style-guide.html`.

- [x] **BL-014** — Palette: orange (`#E8472A`, brand/logo/eyebrows) + white/warm-neutral as main colors, Seagull navy (`#0D1E2C`, buttons/links/focus) as contrast — a deliberate role-swap from Supplier Connect, where orange is the button color. Semantic colors (success/warning/danger/info) reused verbatim from Supplier Connect for cross-product consistency.
- [x] **BL-015** — Logo: reuse the official BarTender mark unaltered (`public/brand/bartender-logo.png`, copied from `supplier-portal`) — icon + real-text wordmark, same pattern as `BartenderLogo.tsx`, not a redraw.
- [x] **BL-016** — Typography: IBM Plex Sans + IBM Plex Sans Condensed + IBM Plex Mono (the mono face specifically for device IDs/EPCs/GTINs/timestamps), replacing Supplier Connect's Open Sans.
- [x] **BL-017** — Done 2026-08-25: CSS custom properties (light+dark tokens), IBM Plex fonts, and the button/card/chip/field component classes ported from `style-guide.html` into `app/globals.css`/`tailwind.config.ts` during scaffolding.
- [ ] **BL-018** — Confirm with Luc whether dark mode (included in `style-guide.html` from the start) is a real requirement or exploratory only — Supplier Connect doesn't have one today.
- [x] **BL-030** — Design system revision, decided 2026-08-26 in Cowork (supersedes part of BL-014/BL-016), implemented 2026-08-27: typography changed to **Inter + JetBrains Mono** (self-hosted via `@fontsource/inter`/`@fontsource/jetbrains-mono` v5.3.0, replacing IBM Plex Sans/Condensed/Mono — the condensed face is gone entirely, eyebrows/labels now just use Inter with uppercase+letter-spacing); page background changed from warm `#FAF8F4` to plain light gray `#F4F4F5`; orange's interactive role expanded to sidebar active-item fill, avatar-menu item hover (Sign out kept its red hover — destructive action, not a category), a new `.chip-brand` category-badge variant, and secondary/ghost buttons — navy still owns primary buttons/links/focus, semantic status colors untouched. `style-guide.html` regenerated against the new tokens (also picked up a pre-existing missing-`<meta charset>` bug found along the way, causing `→` to mojibake). See `CHARTE-GRAPHIQUE.md`.
- [x] **BL-031** — App shell layout revised, decided 2026-08-27 per Luc's explicit request, correcting BL-028, implemented same day: top bar simplified to logo + software name only (left) and the avatar/user menu only (right) — page title moves into each page's own content-area heading (`.page-title`, added to Overview; Settings already had its own; the three still-placeholder pages keep their existing eyebrow tag). Left sidebar relocated to sit below the top bar (full-width top bar; sidebar + content side by side underneath) and made retractable via a toggle button — collapsed shows icon-only nav items (centered, with a title-attribute tooltip), expanded shows icon+label, active item as a filled-orange pill in both states. Collapse state is in-memory only (resets on full reload), not persisted. See `CHARTE-GRAPHIQUE.md` "App shell layout".

## 2. Authentication & user management (P0 — decided, "très similaire à Supplier Portal")

Decided 2026-08-24 in Cowork. Full spec, roles, and flow diagram in `CLAUDE-CONCEPT.md` section 4. Two-role model (`ADMIN`/`USER`) plus a `PENDING` gate — simpler than Supplier Connect's brand/supplier split since this tool has no such distinction.

- [x] **BL-019** — Done 2026-08-25: `User` model + standard NextAuth tables (`Account`, `Session`, `VerificationToken`) via `@auth/prisma-adapter`; `Role` enum (`ADMIN`/`USER`/`PENDING`). `prisma/schema.prisma`.
- [x] **BL-020** — Done 2026-08-25: NextAuth v4 setup, `GoogleProvider` only, `lib/auth.ts` mirroring Supplier Connect's structure.
- [x] **BL-021** — Done 2026-08-25, with one deviation from the original plan: the domain/bootstrap-admin role resolution runs in the **`jwt` callback**, not `signIn` — the Prisma adapter only persists a brand-new user *after* `signIn` resolves, so resolving the role inside `signIn` would race the adapter's own `createUser()`. The `jwt` callback resolves it right after the row is guaranteed to exist, only ever moves a user *out of* `PENDING` (never overwrites an admin-assigned role), and re-reads the DB on every request — which is also what makes an admin's Validate/role-change take effect without the user re-logging in.
- [x] **BL-022** — Done 2026-08-25: `/auth/pending` waiting page, polling `/api/auth/status` every 30s.
- [x] **BL-023** — Done 2026-08-25: middleware requiring auth on every route except `/login`/`/auth/pending`, redirecting `PENDING` users to the waiting page.
- [x] **BL-024** — Done 2026-08-25: `/settings` shell. Non-admins currently see a plain "Nothing here yet" placeholder (no tabs) rather than a tab list with Users hidden — same end result (no admin functions visible), simpler until a second tab exists.
- [x] **BL-025** — Done 2026-08-25, with one simplified field set: table shows name/email/avatar/role/joined only — **no auth-provider or last-login columns**, since those aren't on the `User` model yet. Add `authProvider`/`lastLoginAt` to the schema first if those are wanted. Inline role switch, **Validate** for `PENDING`, **Delete** with confirmation — all working.
- [x] **BL-026** — Done 2026-08-25: last-remaining-`ADMIN` can't be deleted or demoted — enforced both in the UI (disabled + tooltip) and server-side in the API routes.
- [ ] **BL-027** — Nice-to-have, inspired by Supplier Connect's `AdminNotification`: a pending-count badge on the Users tab. Not built yet. *(XS)*
- [x] **BL-028** — Done 2026-08-25: app-shell layout built from `mockup-app-shell.html` — left sidebar (Overview/Devices/Workflows/Serialized Items only), top bar with user avatar menu (Settings, Report a bug, Sign out). Mobile/tablet layout still intentionally deferred.

## 3. Bug reporting (P0 — build now, mirroring ChefMate 1:1)

Brought forward from "later" to now — Luc flagged it as genuinely useful. See `CLAUDE-CONCEPT.md` section 3 and `CLAUDE.md` "Bug handling" for the full spec/process.

- [x] **BL-006** — Done 2026-08-25: `BugReport` Prisma model — title, description, reporter relation, status (`OPEN`/`RESOLVED`), optional `screenshotUrl`, reported/resolved timestamps.
- [x] **BL-007** — Done 2026-08-25: in-app bug report modal (title, description) opened from "Report a bug" in the avatar menu, posting to `/api/bugs`. Screenshot upload is a disabled placeholder button for now — wiring it up is BL-008.
- [ ] **BL-008** — Screenshot storage: reuse Cloudinary the same way ChefMate/ChefCellar do, pending confirmation this work project can use the same account (see BL-001). *(S)*
- [ ] **BL-009** — `npm run bugs:export` script → regenerates `BUGS.md` from all `OPEN` `BugReport`s. *(S)*
- [ ] **BL-010** — `npm run bugs:notify-start -- <id>` and `npm run bugs:notify-resolved -- <id>` scripts, with Resend email templates ("being resolved" / "resolved") to the reporter; `notify-resolved` also deletes the row after sending. *(M)*
- [ ] **BL-011** — `SOLVED-BUGS.md` archive step (append on `RESOLVED`, same fields as ChefMate: number, title, description, dates, screenshot URL if present). *(XS)*
- [ ] **BL-012** — Target `DATABASE_URL_PRODUCTION` specifically for export/notify scripts once staging/main environments exist (BL-005). *(XS)*
- [ ] **BL-013** — Confirm who a "reporter" is for this tool (internal teammate vs. external client) — depends on BL-004; may simplify the email copy/flow versus ChefMate's household-facing wording.

## 4. Technical foundations

*(To break down once the rest of section 0 is settled — on the ChefMate model: Next.js/TypeScript scaffold, Prisma + Neon, staging/main Vercel deployment.)*

## 5. Devices

*(To break down once BL-001 and BL-003 are settled.)*

- [x] **BL-029** — Read-point type icon set integrated 2026-08-26: 13 line-art icons (`components/ui/ReadPointIcon.tsx`, `public/icons/read-point/`), see `CHARTE-GRAPHIQUE.md` "Iconography". Delivered by a separate Claude Design session (source in `package/`), keyed off a partial/observational `GET /reference/read-point-types` type-code list (see `CLAUDE-CONCEPT.md` section 7) — **not yet confirmed with Luc** whether "read-point" is the same concept as this backlog's "Device", or related-but-distinct. Feeds into BL-003 once settled.

## 6. Workflows

*(To break down once BL-003 is settled.)*

## 7. Serialized items

*(To break down once BL-003 is settled.)*

## 8. Bartender API integration

*(To break down as each API is provided per BL-002 — one sub-section per API, mirroring how `CLAUDE-CONCEPT.md` section 6 will document them.)*
