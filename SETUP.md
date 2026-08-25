# One-time setup — GitHub, Neon, Google OAuth, Vercel

Checklist to get `collector-simulator` from local skeleton to a deployed, working app. Do these once; Claude Code picks up from here for everything after. See `BACKLOG.md` BL-005 for the account decisions this follows (personal accounts, same as ChefMate/ChefCellar).

## 1. GitHub repo — done (2026-08-25)

Repo created under `lbk-3344`, skeleton pushed to `staging`.

## 2. Neon database — done (2026-08-25)

Project `collector-simulator` (id `lucky-lab-84095258`), branches `production` (default) and `staging` (created via the Neon MCP connector). Connection strings written straight into local `.env` — `DATABASE_URL` and `DATABASE_URL_STAGING` point at `staging`, `DATABASE_URL_PRODUCTION` at `production`. Still to do: add the same three as Vercel env vars (see section 5 — Vercel MCP has no env-var-write tool, so this one's manual).

## 3. Google Cloud OAuth client (new, dedicated to this app)

1. https://console.cloud.google.com → New project (e.g. "Bartender TT Simulator").
2. APIs & Services → OAuth consent screen: User type **Internal** if this stays inside your Google Workspace org, otherwise **External** with yourself (and any early testers) added under Test users while it's unpublished.
3. APIs & Services → Credentials → Create Credentials → OAuth client ID → Application type **Web application**.
4. Authorized redirect URIs — add now:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   You can add the Vercel preview/production URLs to this same client later, once they exist (Settings → Credentials → edit the client, just add more URIs — no need for a second client).
5. Send over the **Client ID** and **Client Secret** → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## 4. NEXTAUTH_SECRET — done (2026-08-25)

Generated and written into local `.env`.

## 5. Vercel — project created and linked (2026-08-25)

`collector-simulator` project exists on the "ChefMate" team, GitHub repo connected. **Still manual** — the Vercel MCP connector has no env-var-write tool, so in the Vercel dashboard → Project → Settings → Environment Variables, add (copy values from local `.env`):
- `DATABASE_URL_STAGING`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (your Preview URL), `AUTO_APPROVED_SSO_DOMAINS`, `GOOGLE_CLIENT_ID`/`SECRET`, `INITIAL_ADMIN_EMAILS` → scope **Preview**
- `DATABASE_URL_PRODUCTION` + the same NextAuth/Google/admin vars → scope **Production**

## Still open

1. **Google Cloud OAuth client** (section 3 above) — not created yet.
2. **`INITIAL_ADMIN_EMAILS`** — which email will you actually sign in with? If it's your `@seagullsoftware.com` address, `AUTO_APPROVED_SSO_DOMAINS` already gets you in as `USER` automatically, but you still need `INITIAL_ADMIN_EMAILS` set to that same address to land as `ADMIN` instead (otherwise nobody can reach Settings → Users). Confirm the address and it'll get set everywhere (local `.env` + both Vercel scopes).
