# Bartender Track and Trace Simulator — Product Specification

> Working document. Skeleton drafted in Cowork on 2026-08-24, from the project brief and Luc's background running the Bartender Track & Trace platform. Much is still to be settled — see section 12. Product name decided 2026-08-24: **Bartender Track and Trace Simulator** (repo `collector-simulator` remains the technical identifier — see `CHARTE-GRAPHIQUE.md`, `BACKLOG.md` BL-000).

## 1. Pitch

A web app that simulates real-life Track & Trace infrastructure — the devices, workflows, and serialized items that normally exist on a factory floor, packaging line, or distribution site — so that realistic, controllable data can be produced against the **Bartender Track & Trace platform** without needing physical hardware. It lets its users spin up virtual Devices, define Workflows for them to run, and generate new Serialized Items (with or without a physical label) that flow through those workflows and get reported to Bartender via its APIs.

## 2. Concept

Three pillars, per the initial brief:

1. **Devices** — simulate the pieces of real-life infrastructure that produce Track & Trace events in an actual deployment (e.g. RFID readers/printers, barcode scanners, encoding stations, gateways). Each simulated device stands in for a physical one and can be configured, started, and stopped independently. *Device types, configuration fields, and behavior model still to be detailed — see section 11.*
2. **Workflows** — the sequence of steps a serialized item goes through (e.g. encode → verify → pack → ship), and which device(s) perform each step. A workflow is what turns a set of devices into a coherent simulated process. *Workflow structure, step types, and how workflows attach to devices still to be detailed.*
3. **Serialized Items** — create new serialized items (individual unit/case/pallet identity — e.g. a GTIN + serial, an EPC, or similar) **with or without a label**: some items get a simulated physical label/tag printed and encoded as part of the workflow, others are tracked as "born digital" identities with no physical label. *Identity scheme, label format(s), and the with/without-label distinction still to be detailed.*

## 3. Bug reporting (built now — P0)

Built from day one, not deferred — mirrors ChefMate's mechanism exactly (Luc: "really useful"), translated to this project's stack.

- **Model**: a `BugReport` record per report — title, description, reporter, status (`OPEN` / `RESOLVED`), optional `screenshotUrl` (Cloudinary), timestamps (reported, resolved).
- **Reporting**: "Report a bug" in the avatar menu (decided 2026-08-24, see section 4's navigation note) opens the form as a modal, from anywhere in the app — captures title, description, and an optional screenshot, without navigating away from the current screen.
- **`BUGS.md`**: a snapshot of all currently `OPEN` bugs, regenerated on demand via `npm run bugs:export` — not continuously synced, so it can be stale between runs. Read it fresh before starting bug work.
- **`SOLVED-BUGS.md`**: append-only archive of resolved bugs (number, title, description, dates, screenshot URL if present), written to when a bug is marked `RESOLVED`.
- **Reporter notifications**: `npm run bugs:notify-start -- <id>` emails the reporter once work actually starts; `npm run bugs:notify-resolved -- <id>` emails them once the fix has reached production, and only then deletes the `BugReport` row. Assumed for now: Resend for email, same as ChefMate/ChefCellar — to confirm once BL-004 (target users) settles who a "reporter" actually is in a work-context tool (an internal teammate vs. an external client).
- **Environment targeting**: once staging/production environments exist, all of the above targets the production database specifically (`DATABASE_URL_PRODUCTION`) — bug reports only ever come from the live app, same reasoning as ChefMate.
- Full step-by-step process lives in `CLAUDE.md`, "Bug handling".

## 4. Authentication & user management (built now — P0)

Built from day one, not deferred — mirrors Supplier Connect's mechanism (Luc: "très similaire à Supplier Portal"), simplified to a two-role model since this app has no brand/supplier split.

**Roles**: `ADMIN` (full access, including Settings → Users), `USER` (everyone else — nearly all users), `PENDING` (signed in once, waiting on an admin).

**Sign-in**: Google SSO only (NextAuth v4 + `@auth/prisma-adapter` + `GoogleProvider`, same libraries as Supplier Connect's `lib/auth.ts`). No email/password login for this internal tool unless a need for it shows up later.

**Auto-approval rule (new — not present in Supplier Connect today)**: on first sign-in, if the Google account's email domain is in an `AUTO_APPROVED_SSO_DOMAINS` allowlist (starts with just `seagullsoftware.com`), the user is created directly as `USER` — no waiting. Every other domain creates the user as `PENDING` and sends them to a waiting page (`/auth/pending`, polling an auth-status endpoint every 30s, same pattern as Supplier Connect's `PendingPage.tsx`) until an admin validates them from Settings → Users.

**Bootstrap problem**: since nobody starts as `ADMIN`, an `INITIAL_ADMIN_EMAILS` env var lists email(s) — Luc's — that get `ADMIN` directly on first sign-in, bypassing both the domain check and the `PENDING` state. Without this there'd be no way to ever reach the Users tab that grants admin in the first place.

**Safety rule (new, not in Supplier Connect)**: the last remaining `ADMIN` can't be deleted or demoted to `USER`, by anyone, including themselves — prevents an accidental full lockout with nobody able to manage users.

**Settings**: a `/settings` area accessible to every signed-in user, tabbed. The first tab, **Users**, only renders for `ADMIN` (hidden entirely for `USER`, not just disabled/greyed out — mirrors Supplier Connect's `isBrandAdmin` gate, both server-side on the API routes and client-side on the tab list). Other tabs are open to everyone and will be defined as the app grows — until then, a non-admin visiting Settings may see very little, which is expected at this stage.

**Users tab** (admin-only): a table of all users — name/email, avatar, auth provider, last login, role, joined date. Three actions, exactly what Luc asked for:
- **Validate** — for a `PENDING` user, assigns them a role (default `USER`, admin can pick `ADMIN` directly) and lets them in.
- **Change role** — inline role switch (`ADMIN` ⇄ `USER`) for any already-validated user, blocked by the last-admin safety rule above.
- **Delete** — permanently removes a user, with a confirmation prompt, also blocked by the last-admin rule.

No suspend action for now (Supplier Connect has one; not part of what was asked — delete covers it for this tool, suspend can be added later if a softer removal is ever needed).

**Inspired-by addition (from Supplier Connect's `AdminNotification` system, scoped down)**: a small pending-count badge, shown on the Users tab itself (see navigation below).

**Navigation (decided 2026-08-24)**: desktop layout only for now — left sidebar for the main app sections: **Overview, Devices, Workflows, Serialized Items** only. Bug Reports is deliberately **not** in the sidebar (revised 2026-08-24: it's a help/improvement channel, not a core function of the tool, so it doesn't earn a top-level slot) and neither is Settings — both live **only** behind the user avatar in the top-right corner of the top bar. Click it to open a small menu: name/email/role, then **Settings**, then **Report a bug**, then Sign out. Settings itself (including the admin-only Users tab) opens as its own view once "Settings" is clicked there; "Report a bug" instead opens the bug-report form (see section 3) directly as a modal, without leaving the current screen — reporting a bug shouldn't require navigating away from whatever you were doing when you hit it. This is a deliberate difference from Supplier Connect, where Users is a top-level sidebar item — here both Settings and bug reporting are nested one level deeper, being either admin-only or secondary to the app's core purpose. Mobile/tablet layout not addressed yet (see `BACKLOG.md` BL-028). First mockup: `mockup-app-shell.html` (published as a Cowork Artifact) — interactive, shows the sidebar, the avatar menu opening, the bug-report modal, and the Users tab with a live pending → validate flow.

**Flow**:

```mermaid
flowchart TD
    A[Sign in with Google] --> B{First time?}
    B -- No --> C{Suspended / deleted?}
    C -- No --> Z[Signed in]
    C -- Yes --> X[Blocked]
    B -- Yes --> D{Email in INITIAL_ADMIN_EMAILS?}
    D -- Yes --> E[role = ADMIN]
    D -- No --> F{Domain in AUTO_APPROVED_SSO_DOMAINS?<br/>e.g. seagullsoftware.com}
    F -- Yes --> G[role = USER]
    F -- No --> H[role = PENDING]
    E --> Z
    G --> Z
    H --> W[/auth/pending — waits for an admin]
    W -.->|admin validates in Settings → Users| G
```

## 5. Target users

*Not yet settled — likely candidates given the internal/work context (to confirm):*

- Solution engineers running demos or proofs of concept for prospects/clients without needing physical readers/printers on site.
- QA/dev team members testing the Bartender Track & Trace platform against realistic event volumes and edge cases.
- Sales engineering, for scripted demo scenarios.

## 6. Usage scenarios

*To be written once section 3 (users) and the Bartender API integration scope (section 5) are clearer.*

## 7. Bartender Track & Trace API integration

The simulator's output (device events, workflow executions, serialized item creation/movement) is reported to the **Bartender Track & Trace platform** via its APIs. Luc will provide the relevant API specs **incrementally, one at a time**, as each integration point becomes needed — this section grows as each API is documented.

*No API documented yet. When one is provided, record here: the API's purpose, the endpoint(s)/operations used, the request/response shape relevant to the simulator, auth mechanism, and the date it was added — same pattern as the dated decisions in section 11.*

## 8. Objectives

*Draft, to confirm:*

- Produce Track & Trace event data that is realistic enough to exercise the Bartender platform the way real infrastructure would.
- Remove the need for physical devices (readers, printers) when demoing, testing, or developing against Bartender.
- Make it fast to define a new simulated scenario (device set + workflow) without custom code per scenario.

## 9. KPIs

*Not yet defined — to confirm once objectives (section 6) are validated. Candidates: number of distinct scenarios simulated, volume/throughput of simulated events, time to stand up a new scenario.*

## 10. MVP success criteria

*To define once section 0 of `BACKLOG.md` is resolved (first API to integrate, first scenario to support end-to-end).*

## 11. Out of scope (V1)

*To confirm — placeholder candidates: physical hardware integration (this is a pure simulator), multi-tenant/multi-company support, anything beyond the first Bartender API provided.*

## 12. Non-functional notes

*To be filled in — expected data volumes, whether simulation needs to run in real time or can be batch/scripted, any performance targets.*

## 13. Product decisions

Dated log of product decisions, most recent first. This is the section to check before making an undocumented product call.

- **2026-08-25** — Hosting/infrastructure decided (closes `BACKLOG.md` BL-005): **personal accounts**, same as ChefMate/ChefCellar — GitHub `lbk-3344`, Vercel "ChefMate" team. Neon project to be created by Luc directly in the Neon console (no Neon MCP/CLI reachable from Cowork or the local machine at this stage) — he'll share the resulting `DATABASE_URL`(s) once ready. Google Cloud OAuth client: a new dedicated one for this app, not a reuse of an existing project.
- **2026-08-25** — App skeleton built in Cowork (Next.js/TS/Prisma/Tailwind/NextAuth v4), covering `BACKLOG.md` sections 1-3 (design tokens, auth & user management, bug reporting) except BL-008 (Cloudinary screenshot upload — placeholder only), BL-009/010/011 (bugs export/notify scripts), and BL-027 (pending-count badge). Two implementation notes worth recording:
  - The domain/bootstrap-admin auto-role logic (section 4 above) runs in NextAuth's `jwt` callback rather than `signIn` — the Prisma adapter only persists a new user row *after* `signIn` resolves, so resolving the role inside `signIn` would race the adapter's own user creation. Functionally identical outcome (PENDING/USER/ADMIN resolution exactly as specified), just relocated; also means a role change an admin makes takes effect on the user's very next request, not just on their next login.
  - The Users tab table (section 4) currently shows name/email/avatar/role/joined only — **no auth-provider or last-login columns** yet, since those aren't on the `User` model. Add `authProvider`/`lastLoginAt` fields first if those are wanted; not blocking since Google is the only provider today anyway.
- **2026-08-24** — App-shell navigation decided: desktop-only for now, left sidebar for main sections, Settings reached exclusively through the top-right user avatar menu (not in the sidebar) — the admin-only Users tab lives one level inside Settings rather than as its own top-level item, unlike Supplier Connect. "Report a bug" added to the same avatar menu, directly below Settings, opening the bug form as a modal rather than navigating away. **Revised same day**: Bug Reports removed from the left sidebar entirely (it was there in the very first mockup) — bug reporting is a help/improvement channel, not one of the tool's core functions, so it doesn't warrant a top-level nav slot; the avatar menu is its only entry point. First interactive mockup: `mockup-app-shell.html`. See `CLAUDE-CONCEPT.md` section 4 and `BACKLOG.md` BL-028.
- **2026-08-24** — Authentication & user management decided: Google SSO only via NextAuth v4 (same libraries as Supplier Connect), two-role model (`ADMIN`/`USER`) plus a `PENDING` gate, with `@seagullsoftware.com` sign-ins auto-approved to `USER` and everyone else requiring admin validation. Added two rules not present in Supplier Connect: an `INITIAL_ADMIN_EMAILS` bootstrap (so Luc can become the first admin at all) and a last-admin-can't-be-removed safety rule. Settings is open to everyone; its Users tab is admin-only. See `BACKLOG.md` section 2 (BL-019 to BL-027) and the flow diagram in section 4 above.
- **2026-08-24** — Framework stack effectively confirmed by precedent, ahead of a formal BL-001 close-out: Next.js (App Router, TypeScript), Prisma, PostgreSQL, Tailwind, and now NextAuth v4 — every concrete ask since kickoff (design tokens, bug reporting, auth) has assumed this stack, matching Supplier Connect's. What's still genuinely open is hosting ownership (personal accounts vs. company infrastructure), not the framework choice.
- **2026-08-24** — Design system decided: orange + white as the main colors, Seagull navy as contrast (buttons/links/focus/highlights) — reusing the exact BarTender/Seagull brand colors already live in Supplier Connect, but swapping which one carries interaction (there, orange is the button color). Logo: the official BarTender mark, reused unaltered from `../supplier-portal`. Typography: IBM Plex Sans/Condensed/Mono. Full rationale and token values in `CHARTE-GRAPHIQUE.md` and `style-guide.html`. See `BACKLOG.md` section 1 (BL-014 to BL-018).
- **2026-08-24** — Product name decided: **Bartender Track and Trace Simulator**. Repo stays `collector-simulator` as the technical identifier (same pattern as ChefCellar's repo `winecellar` vs. product name). See `BACKLOG.md` BL-000.
- **2026-08-24** — Bug reporting brought forward to build now (P0), not deferred until MVP as originally planned — Luc flagged it as a genuinely useful feature from ChefMate worth having from the start. Mirrors ChefMate's mechanism 1:1 (see section 3). See `BACKLOG.md` section 1.
- **2026-08-24** — Project kicked off in Cowork, mirroring the ChefMate/ChefCellar project structure (same `CLAUDE.md` / `CLAUDE-CONCEPT.md` / `BACKLOG.md` pattern, same Cowork-for-spec / Claude-Code-for-dev split, same staging/main branch and versioning conventions) — explicit request from Luc. Key differences from ChefMate/ChefCellar: work-context project, English throughout, connects to the Bartender Track & Trace platform rather than being a standalone consumer app. Bartender API specs will be supplied incrementally by Luc, one at a time, rather than all at once. Tech stack, target users, and core data model are all still open — see `BACKLOG.md` section 0.
