# One-time setup — GitHub, Neon, Google OAuth, Vercel

Checklist to get `collector-simulator` from local skeleton to a deployed, working app. Do these once; Claude Code picks up from here for everything after. See `BACKLOG.md` BL-005 for the account decisions this follows (personal accounts, same as ChefMate/ChefCellar).

## 1. GitHub repo

1. Go to https://github.com/new, signed in as `lbk-3344`.
2. Repository name: `collector-simulator`. Visibility: your call (private recommended for a work-context tool).
3. Leave it **empty** — no README, no `.gitignore`, no license (the local skeleton already has these).
4. Create it. No further action needed there — the push happens from your machine once the skeleton lands locally.

## 2. Neon database

1. https://console.neon.tech → New project.
2. Name it `collector-simulator` (or `bartender-tt-simulator`).
3. This gives you a default branch (`main`) — that's **production**.
4. Create a second branch called `staging` (Neon's branch-from-`main` feature) — that's what Vercel Preview deployments will use. This mirrors ChefMate/ChefCellar's staging/main split without needing two separate Neon projects.
5. Grab the connection string for each branch (Neon's dashboard → Connect, pick the branch from the dropdown) and send them over:
   - `main` branch connection string → `DATABASE_URL_PRODUCTION`
   - `staging` branch connection string → `DATABASE_URL_STAGING` (and use the same one for local dev's `DATABASE_URL`, or create a third personal branch if you'd rather keep local fully separate)

## 3. Google Cloud OAuth client (new, dedicated to this app)

1. https://console.cloud.google.com → New project (e.g. "Bartender TT Simulator").
2. APIs & Services → OAuth consent screen: User type **Internal** if this stays inside your Google Workspace org, otherwise **External** with yourself (and any early testers) added under Test users while it's unpublished.
3. APIs & Services → Credentials → Create Credentials → OAuth client ID → Application type **Web application**.
4. Authorized redirect URIs — add now:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   You can add the Vercel preview/production URLs to this same client later, once they exist (Settings → Credentials → edit the client, just add more URIs — no need for a second client).
5. Send over the **Client ID** and **Client Secret** → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## 4. NEXTAUTH_SECRET

Generate one locally: `openssl rand -base64 32` — same value in `.env` (local) and in Vercel's env vars for both Preview and Production.

## 5. Vercel

Once the GitHub repo has the skeleton pushed, this gets linked to the "ChefMate" Vercel team (`team_jVWZVRFpRFpbLSAiWG7RchQb`) — Cowork can do this part directly via the Vercel MCP connector once the push has happened.

## What to send back

Once you've done 1-4: the four connection strings/secrets (`DATABASE_URL_STAGING`, `DATABASE_URL_PRODUCTION`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) plus confirmation the GitHub repo is created. Send credentials directly to Claude Code locally (into `.env`, never committed) rather than pasting them into this chat.
