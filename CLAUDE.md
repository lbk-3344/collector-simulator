# Instructions for Claude Code on this repo

**Bartender Track and Trace Simulator** (repo `collector-simulator`) — a web app that simulates real-life Track & Trace infrastructure (Devices, Workflows, Serialized Items) to produce realistic test data for the **Bartender Track & Trace platform**, via its APIs.

> This file is a starting point cloned from the ChefMate/ChefCellar projects' organization — same working method, same conventions. Product content (pitch, decisions, backlog) is specific to this project and starts from zero — to be adjusted as the first decisions are made (see `BACKLOG.md` section 0). Unlike ChefMate/ChefCellar, this is a work-context project: everything is in **English**, and it targets an internal/professional use case rather than a consumer app.

## Documents to read before coding

- `CLAUDE-CONCEPT.md` — product specification. Source of truth for the product, still largely to be filled in at this stage. Section 11 holds the dated log of product decisions — if a product or data-model question comes up during dev that isn't already settled there, ask; don't silently make an undocumented product call.
- `BACKLOG.md` — work items (`BL-XX`), prioritized P0 (MVP)/P1/P2. Work item by item, referring to their ID. **Section 0 first**: decisions to settle before the rest of the backlog makes sense.
- `CHARTE-GRAPHIQUE.md` — name, palette, typography, logo (decided 2026-08-24). `style-guide.html` has the actual CSS tokens and component previews — copy from it directly when scaffolding `globals.css`/`tailwind.config.ts`.
- `BUGS.md` / `SOLVED-BUGS.md` — open and archived bug reports (see "Bug handling" below).
- `.env.example` — expected environment variables, including the auth config from `CLAUDE-CONCEPT.md` section 4 (`AUTO_APPROVED_SSO_DOMAINS`, `INITIAL_ADMIN_EMAILS`).
- `prisma/schema.prisma` — data model, to be designed once the section 0 decisions are settled.

## Bartender Track & Trace API integration

This simulator's whole point is to exercise the Bartender Track & Trace platform's APIs. Luc will provide the API specs **incrementally, one API at a time, as they become needed** — do not assume the shape of an endpoint that hasn't been provided yet. When a feature needs an API that isn't documented in `CLAUDE-CONCEPT.md` yet, stop and ask for the spec rather than guessing a contract. Once an API is provided, document it in `CLAUDE-CONCEPT.md` (dedicated integration section) before wiring it into code, the same way product decisions are logged in section 11.

## Division of work

Like ChefMate/ChefCellar, this project moves on two surfaces: Cowork (spec, design, doc, data modeling) and Claude Code, here (the actual dev loop: `npm`, `prisma migrate`, tests, `git push`, Vercel deployment). If a product or data-model question comes up during dev that isn't already settled in `CLAUDE-CONCEPT.md`, ask — don't make an undocumented product call without flagging it explicitly.

This is a **standalone** Cowork project, not a folder tacked onto another one.

## Branches and deployment cycle

To be set up on the same model as ChefMate/ChefCellar once the repo is scaffolded: two deployed branches, `staging` (Vercel Preview) and `main` (Production), each with its own isolated database.

- **Default working branch: `staging`.** A request to "commit" also implies pushing to `origin/staging` — no risk, it only triggers a Preview deployment.
- **Never push directly to `main`** without an explicit request ("push to prod" / "deploy to prod"). Only then: fast-forward merge of `staging` into `main`, then push `main`.
- If `staging` and `main` have diverged, flag it before merging rather than forcing a silent resolution.
- Before pushing a new commit, check that the previous deployment for that branch is actually `READY`/succeeded — don't assume a push succeeding means the deployment did. Batch small back-to-back tweaks into one commit rather than pushing on every change.

## Conventions

- After finishing a `BACKLOG.md` item, check it off (`- [x]`) in the file, with a short completion note.
- Any data-model change must go through a Prisma migration (`npx prisma migrate dev --name <name>`), never a manual DB edit.
- **Versioning (semver)**: before committing a finished backlog item, bump the version in `package.json` with the standard npm command (never a manual edit of the `version` field):
  - New backlog item **without** a letter suffix (new feature, e.g. `BL-30`) → `npm version minor --no-git-tag-version`.
  - Item with a letter suffix (variant/improvement of an existing item, e.g. `BL-24b`) **or** a bug fix → `npm version patch --no-git-tag-version`.
  - `npm version major` **never** without an explicit instruction from Luc in the conversation.
  - The `package.json` change is part of the same commit as the delivered work, not a separate one.
  - A commit touching several items at once bumps only once, at the highest level involved (minor wins over patch).
- **Bug handling** (built now — P0, mirroring ChefMate's mechanism 1:1, see `BACKLOG.md` section 1 and `CLAUDE-CONCEPT.md` section 3). Scripts live in `scripts/` (`tsx`), take a `<ref>` that is either the bug's short `number` or its cuid `id`, and all run against `DATABASE_URL_PRODUCTION`:
  1. Before starting bug work in a session, regenerate `BUGS.md` (`npm run bugs:export`) — no continuous sync, the file can be stale.
  2. As soon as you actually start working a specific bug, `npm run bugs:notify-start -- <ref>` ("being worked on" email to the reporter; sets `notifiedStartAt`, safe to re-run).
  3. Once fixed: `npm run bugs:resolve -- <ref>` — sets the `BugReport` to `RESOLVED`, appends it to `SOLVED-BUGS.md` (number, title, description, dates, screenshot URL if set — otherwise the image is orphaned on Cloudinary once the row is deleted), and regenerates `BUGS.md`. **The DB row is not deleted at this step.**
  4. After the fix has actually reached **production** (merge `staging` → `main` then push `main` — not just the initial push to `staging`), `npm run bugs:notify-resolved -- <ref>` ("fixed" email to the reporter, then the row is deleted and `BUGS.md` regenerated).
  - All four target `DATABASE_URL_PRODUCTION`, never the local dev DB — bug reports only ever come in against the live app. `RESEND_API_KEY` unset ⇒ the notify scripts still do their DB work, they just skip the email.
  - Email is Resend (`lib/email.ts`, `RESEND_API_KEY` / `RESEND_FROM_EMAIL`); optional screenshot storage is Cloudinary (BL-008, not built yet).
