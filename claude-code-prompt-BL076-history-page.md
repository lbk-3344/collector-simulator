# Claude Code prompt — BL-076: History page (API call log + EPCIS events) + left nav item

## Task:

Luc's direct request: "I would like to add a history page and a left menu item. The intent in this page is have two tab, one showing the last 100 endpoints called by the tool for the specific user, and another one that shows the last 20 EPCIS events from the Track and Trace platform." Two tabs, two very different states of readiness — split accordingly:

1. **Endpoint calls tab — buildable now (BL-076).** Every outgoing call this app makes to Bartender is already funneled through a small number of library functions (enumerated in Phase 3), and BL-074b (`makeOwnerCredentialsCache()`, `lib/bartenderLocations.ts` / `lib/workflowRun.ts` / `lib/deviceHeartbeat.ts`) already resolves a real owning `User` for every one of them — interactive or background — so "for the specific user" has a clean answer: the signed-in caller for interactive requests, the resolved owner for cron-driven ones (workflow firings, heartbeats).

2. **EPCIS events tab — unblocked, build the real thing (BL-076a).** Luc has now shared the real endpoint (two worked `curl` examples — one unfiltered, one filtered by `premise`):
   ```
   curl --location 'https://demotrackandtrace.sandbox.bartender-tt.com/epcis-core/rest/events/searches' \
   --header 'Content-Type: application/json' \
   --header 'Authorization: Basic <tenant Basic-Auth creds>' \
   --data '{
       "filters": [
           { "property": "type", "operator": "WD", "values": ["*Event"] },
           { "property": "premise", "operator": "EQ", "values": ["TTMBASE"] }
       ],
       "order": { "property": "eventTime", "direction": "DESC" },
       "pagination": { "documents": 100, "page": 0 }
   }'
   ```
   (the second example is identical minus the `premise` filter — for "All Locations"). Full contract, judgment calls, and the one thing still genuinely unknown (the response shape — only the request was provided) are in Phase 6 below and `CLAUDE-CONCEPT.md` §7.9. Do not hardcode the `Authorization` value shown above anywhere — it's Luc's own ad hoc test credential, not something this app stores; reuse the already-stored Track & Trace username/password (§7.4) exactly like the legacy Product API (§7.7) already does.

**Judgment calls made here, flagged rather than asked as blocking questions** (consistent with how BL-073/074/075 handled analogous calls):
- **Security — never persist secrets in the log.** The Bartender API key and Basic-Auth password are already treated as sensitive everywhere else in this app (AES-256-GCM at rest via `lib/crypto.ts`, masked to last-4 in Settings). The new `ApiCallLog` table must never store a raw `apikey` or `Authorization` header value — redact both (case-insensitive) to a fixed placeholder before the row is written, not after. The "copy as curl" button substitutes the same placeholder — it can never surface a real secret pulled back out of a log row, only out of the live in-memory request it's copying *while building it in Phase 5's modal, which itself only ever holds the already-redacted stored value*.
- **Retention: keep the last 500 rows per user, display the last 100.** Luc asked for "the last 100" shown; storing a bit more than that (500/user) gives cheap headroom without the row ever growing unbounded, and avoids a separate scheduled job — the prune runs inline, best-effort, right after each insert.
- **Body truncation: ~20KB per request/response body.** Large binary responses (the legacy floor-map image fetch, in particular) get stored as `[binary, N bytes, not logged]` rather than a giant base64 blob — flag this explicitly in Phase 2, it's the one call site that needs a body special-case.
- **Human-readable titles, sourced from the real spec docs where one exists, hand-written where none does.** Verified against the project's own OpenAPI docs (exact `summary` text) for every call this app actually makes; the legacy Basic-Auth APIs (`product-api`, `statemachine-api-configuration`) have **no spec doc in this project at all** — their labels below are hand-written, and Phase 3 says so inline at each site so nobody mistakes them for spec-sourced text later.
- **EPCIS: live-probe the response before writing the parser.** Luc's message gave the request shape only — no sample response. Phase 6 requires one real authenticated call against the sandbox tenant first, to record the actual JSON (event type field name, `bizStep`, whatever carries the item count, an id field) before any TypeScript type or UI-binding code is written against it. Don't extrapolate the response shape from the request beyond what's noted as a hint in Phase 6.
- **EPCIS: `premise` filter value — a strong inference, not a confirmed fact.** Luc's example uses `TTMBASE` for `premise`; the likely match is this app's own `Location.code` (from `location-api-v2`, already used internally as a site's "premise" — see `findFloorForPremiseCode`, §7.4), but this project has been burned before by same-looking Bartender codes not lining up across different APIs (BL-070). Phase 6 requires a one-call live check (fetch a small unfiltered page, compare a real event's `premise` value against a known site's `code`) before wiring the Location dropdown's filter through on faith.
- **EPCIS: `pagination.documents` set to 20, not Luc's example value of 100.** Luc's own ask was "the last 20 EPCIS events"; his `curl` examples just happen to demonstrate with 100. Use `20` as a small named constant (`EPCIS_EVENTS_LIMIT`), trivial to raise later if he wants more.

### Human-readable operation labels (use exactly these; sources noted)

| Library call | Label to store/display | Source |
|---|---|---|
| `bartenderLocations.listLocations` | "List Locations" | `location-api-v2` spec (`listLocations`) |
| `bartenderLocations.getLocationZones` | "List Zones" | `location-api-v2` spec (`listZones`) |
| `bartenderLocations.getLocationMap` | "Get a Location Floor Plan" | `location-api-v2` spec — inferred from sibling operations ("Get a Location", "Delete a Location Floor Plan"); **not verbatim-confirmed**, flag as inference in a code comment |
| `bartenderLocations` legacy premise listing (`callTenantApi`) | "List premises (legacy)" | hand-written, no spec doc exists for `statemachine-api-configuration` |
| `bartenderLocations` legacy floor listing (`callTenantApi`) | "List floors (legacy)" | hand-written, no spec doc exists |
| `bartenderLocations` legacy floor-map image fetch (~line 291) | "Get floor plan (legacy)" | hand-written, no spec doc exists |
| `bartenderInventory.getStock` | "Get current stock snapshot" | `inventory-public-api` spec (`getStock`) |
| `bartenderDataCollector` register (~line 98) | "Register or update a DataCollector" | `datacollector-api-v3` spec |
| `bartenderDataCollector` deregister (~line 137) | "Deregister a DataCollector" | `datacollector-api-v3` spec |
| `bartenderDataCollector` submitReads/`sendReads` (~line 201) | "Submit tag reads" | `datacollector-api-v3` spec (`submitReads`) — note the function in this codebase is named `sendReads`, the spec's own title is "Submit tag reads"; use the spec title, not the function name |
| `bartenderDataCollector` heartbeat (~line 259) | "Send a DataCollector heartbeat" | `datacollector-api-v3` spec (`sendHeartbeat`) |
| `bartenderSerialization.generateGs1` | "Generate GS1 identifiers" | `serialization-api-v3` spec |
| `bartenderProducts` shared fetch (~line 82), `listProducts` | "List products" | hand-written, no spec doc exists for `product-api` |
| `bartenderProducts` shared fetch (~line 82), `listCategories` | "List categories" | hand-written, no spec doc exists |

### Phase 1 — schema

Add to `prisma/schema.prisma`:

```prisma
model ApiCallLog {
  id        String   @id @default(cuid())
  userId    String   // the attributed owner — see task note above (interactive caller or resolved cron owner)
  user      User     @relation(fields: [userId], references: [id])

  operation String   // human-readable label from the table above — stored, not recomputed, so old rows stay readable if labels change later

  method  String   // "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  url     String   // full request URL actually called (query string included) — never contains a secret, Bartender auth is header-only everywhere in this app

  requestHeaders  Json?   // redacted — apikey/authorization values replaced with "***redacted***" before this row is ever written
  requestBody     String? // truncated to ~20KB, see Phase 2

  responseStatus  Int?
  responseBody    String? // truncated to ~20KB; binary responses stored as "[binary, N bytes, not logged]"
  errorMessage    String? // set instead of a response when the fetch itself threw (network error, timeout)

  durationMs Int?
  createdAt  DateTime @default(now())

  @@index([userId, createdAt])
}
```

Add the back-relation to `User`: `apiCallLogs ApiCallLog[]`.

`npx prisma migrate dev --name add_api_call_log`.

### Phase 2 — `lib/apiCallLog.ts`, the centralized logging wrapper

```typescript
import { prisma } from "@/lib/prisma";

const MAX_BODY_CHARS = 20_000;
const MAX_ROWS_PER_USER = 500;
const REDACTED_HEADER_KEYS = ["apikey", "authorization"];
const REDACTED_VALUE = "***redacted***";

function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = REDACTED_HEADER_KEYS.includes(key.toLowerCase()) ? REDACTED_VALUE : value;
  }
  return out;
}

function truncate(body: string | null | undefined): string | null {
  if (body == null) return null;
  return body.length > MAX_BODY_CHARS
    ? body.slice(0, MAX_BODY_CHARS) + `\n...[truncated, ${body.length} bytes total]`
    : body;
}

export async function loggedFetch(
  userId: string,
  operation: string,
  url: string,
  init: RequestInit & { headers?: Record<string, string> },
  opts?: { binaryResponse?: boolean }
): Promise<Response> {
  const startedAt = Date.now();
  const requestHeaders = redactHeaders(init.headers);
  const requestBody = typeof init.body === "string" ? truncate(init.body) : init.body ? "[non-string body, not logged]" : null;

  let response: Response | null = null;
  let errorMessage: string | null = null;
  let responseBody: string | null = null;

  try {
    response = await fetch(url, init);
    responseBody = opts?.binaryResponse
      ? `[binary, ${response.headers.get("content-length") ?? "unknown"} bytes, not logged]`
      : truncate(await response.clone().text());
    return response;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    // Best-effort — a logging failure must never break the underlying Bartender call.
    prisma.apiCallLog
      .create({
        data: {
          userId,
          operation,
          method: init.method ?? "GET",
          url,
          requestHeaders,
          requestBody,
          responseStatus: response?.status ?? null,
          responseBody,
          errorMessage,
          durationMs: Date.now() - startedAt,
        },
      })
      .then(() =>
        // Inline prune, best-effort, no separate job — see task note on retention.
        prisma.apiCallLog.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: MAX_ROWS_PER_USER,
          select: { id: true },
        })
      )
      .then((stale) => stale.length && prisma.apiCallLog.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } }))
      .catch((e) => console.error("[apiCallLog] failed to write/prune log row", e));
  }
}
```

Wraps `fetch` 1:1 (same signature plus the `userId`/`operation` prefix), so each of the 10 call sites in Phase 3 is a small, mechanical change: `fetch(url, init)` → `loggedFetch(userId, "<label>", url, init)`, threading `userId` down from wherever that function already resolves its owner/session (post-BL-074b, every one of these already has that value close at hand — `makeOwnerCredentialsCache()`'s resolved owner for the cron paths, `session.user.id` for interactive routes).

### Phase 3 — refactor the 10 call sites

**Worked example — `lib/bartenderLocations.ts`, `callGateway()`:**

Before:
```typescript
const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
```

After:
```typescript
const res = await loggedFetch(ownerId, operationLabelFor(url), url, {
  method,
  headers,
  body: body ? JSON.stringify(body) : undefined,
});
```

Where `operationLabelFor(url)` is a tiny local lookup (path suffix → label from the table above — `listLocations` calls `/locations`, `getLocationZones` calls `/locations/{code}/zones`, `getLocationMap` calls `/locations/{code}/map`) since `callGateway` is a shared helper backing all three. `ownerId` is whatever this function already receives or resolves to build its credentials (post-BL-074b) — thread it through as a new parameter if `callGateway` doesn't already have it in scope.

**Remaining 9 sites — same mechanical change, one file at a time, re-verify after each (see Verify section — this touches every live Bartender integration path in the app):**

1. `lib/bartenderLocations.ts` — `callTenantApi()` (legacy premise/floor listing, shared helper) → labels "List premises (legacy)" / "List floors (legacy)" by path.
2. `lib/bartenderLocations.ts` — the raw Basic-Auth `fetch` at ~line 291 (legacy floor-map binary image) → label "Get floor plan (legacy)", **and** pass `{ binaryResponse: true }` so the response body is never fully read/stored.
3. `lib/bartenderInventory.ts` — `getStock()` (~line 69) → label "Get current stock snapshot".
4. `lib/bartenderDataCollector.ts` — register (~line 98) → "Register or update a DataCollector".
5. `lib/bartenderDataCollector.ts` — deregister (~line 137) → "Deregister a DataCollector".
6. `lib/bartenderDataCollector.ts` — `sendReads`/submitReads (~line 201) → "Submit tag reads".
7. `lib/bartenderDataCollector.ts` — heartbeat (~line 259) → "Send a DataCollector heartbeat".
8. `lib/bartenderSerialization.ts` — `generateGs1()` (~line 70) → "Generate GS1 identifiers".
9. `lib/bartenderProducts.ts` — shared fetch helper (~line 82) → "List products" / "List categories" by path, `userId` here comes from `getBasicAuthCreds(userId)`'s existing parameter — already in scope, no new threading needed.

### Phase 4 — API routes

- **`app/api/history/calls/route.ts`** — `GET`, session-gated (any signed-in approved role). Returns the caller's own last 100 `ApiCallLog` rows (`where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 100`), a lightweight projection for the list view (`id, operation, method, url, responseStatus, createdAt` — not the full bodies, those load on demand in Phase 5's detail fetch).
- **`app/api/history/calls/[id]/route.ts`** — `GET`, full row, but **only if `row.userId === session.user.id`** — a 404 (not 403, don't confirm the id exists for someone else) if it belongs to another user.

### Phase 5 — Endpoint-calls tab UI

New `/history` page, tab 1. Table: one row per call — `operation` label, relative time, a status pill (green 2xx, amber 4xx, red 5xx/error — reuse this app's existing status-pill CSS pattern if one exists, else a small new one consistent with `.device-state` dot+label styling). Row click opens a modal:

- **Left panel — Request.** Method + URL, headers (as redacted, rendered `key: value`, the redacted entries visibly showing `***redacted***` rather than being hidden — so it's obvious to Luc/IT support that something *was* sent there, just not disclosed), body (pretty-printed JSON if parseable). A "Copy as curl" button building a `curl` command from these exact fields, substituting `apikey: <REDACTED — replace with your own key>` (or the Basic-Auth equivalent) for the placeholder value — never a real secret, because the stored value is never anything but the placeholder to begin with.
- **Right panel — Response.** Status code, body (pretty-printed JSON if parseable, or the binary placeholder text). A plain "Copy response" button (raw text to clipboard).

Since no copy-to-clipboard pattern exists anywhere in this app yet (confirmed by grep), introduce one small shared helper (`navigator.clipboard.writeText`, with a brief "Copied" inline confirmation state on the button — no toast system exists either, keep it local to the button) and reuse it for both buttons here.

### Phase 6 — EPCIS-events tab, real implementation (`lib/bartenderEpcis.ts`)

**Step 0 — live-probe the response shape before writing any type or parser.** Luc's message gave the request `curl`s only, never a sample response. Using the already-stored Track & Trace username/password (§7.4/7.7's `getBasicAuthCreds`-style credentials — add an equivalent resolver here, or reuse/export the existing one from `lib/bartenderProducts.ts` if it's a clean fit), make one real call:

```
POST {bartenderTenantUrl}/epcis-core/rest/events/searches
Authorization: Basic <base64 of the stored username:password>
Content-Type: application/json

{ "filters": [{ "property": "type", "operator": "WD", "values": ["*Event"] }],
  "order": { "property": "eventTime", "direction": "DESC" },
  "pagination": { "documents": 5, "page": 0 } }
```

Inspect the real JSON returned — top-level envelope (`documents`? `events`? something else — the request's own `pagination.documents` key is a hint, not a guarantee), each event's type field, its `bizStep`, whichever field(s) carry the item count (`epcList` and/or `quantityList` — EPCIS events can carry either depending on event/product type), an event id, and `eventTime`. **Record the real shape as a comment in `lib/bartenderEpcis.ts` and update `CLAUDE-CONCEPT.md` §7.9 with what was actually found** before proceeding — this is the same "verify the live shape before trusting the written spec" discipline this project has followed for every other Bartender API (e.g. §7.3/7.5's gateway-and-header corrections).

**`lib/bartenderEpcis.ts`**:

```typescript
const EPCIS_EVENTS_LIMIT = 20; // Luc's literal "last 20 EPCIS events" ask — his own curl examples show 100, that's just his test value

export async function searchEpcisEvents(
  tenantUrl: string,
  username: string,
  password: string,
  opts: { locationCode?: string } = {}
): Promise<GatewayResult<EpcisEvent[]>> {
  const filters: Array<{ property: string; operator: string; values: string[] }> = [
    { property: "type", operator: "WD", values: ["*Event"] },
  ];
  if (opts.locationCode) {
    filters.push({ property: "premise", operator: "EQ", values: [opts.locationCode] });
  }

  const url = `${tenantUrl.replace(/\/+$/, "")}/epcis-core/rest/events/searches`;
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  // route through loggedFetch (Phase 2) once that exists, same as every other call site
  const res = await loggedFetch(userId, "Search EPCIS events", url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      filters,
      order: { property: "eventTime", direction: "DESC" },
      pagination: { documents: EPCIS_EVENTS_LIMIT, page: 0 },
    }),
  });

  // ...parse per whatever Step 0's live probe actually found — don't guess further than that.
}
```

**Location-code correspondence — verify, don't assume.** Before wiring the Location dropdown's value straight through as `locationCode` above, confirm with the same Step 0 probe (or a second one) that a real event's `premise` value actually equals one of this app's own `Location.code` values (from `location-api-v2`, §7.3 — the same field `findFloorForPremiseCode` already calls a site's "premise" internally, §7.4). If it doesn't match, stop and flag it back rather than silently filtering on the wrong field — this project has been burned by exactly this kind of code mismatch before (BL-070, §13).

- **`app/api/history/epcis/route.ts`** — `GET`, accepts `?location=<code>|all`, session-gated. Resolves the caller's stored Track & Trace credentials (400 with a "set your credentials in Settings" message if missing, same pattern as `resolveProductApi`), calls `searchEpcisEvents(tenantUrl, username, password, { locationCode: location === "all" ? undefined : location })`, returns the parsed events (or the real Bartender error, same error-shape-passthrough convention as `lib/bartenderLocations.ts`'s other routes).
- Tab 2 UI: header row with a **Location** dropdown ("All Locations" + each of the caller's locations, from the same source the Overview site selector uses, §14) and a **Reload** button that re-fetches `/api/history/epcis?location=...`. Event list: one row per event — `<type>` + formatted `bizStep` (last path segment of the URN, e.g. "ObjectEvent — shipping"; no existing bizStep-formatting helper in this app, write a small new one) and the item count. Row click opens a detail modal showing the full raw event JSON, pretty-printed, with a "Copy" button (reuse Phase 5's clipboard helper). Empty state ("No EPCIS events found for this selection") only when the real call legitimately returns zero — a real Bartender error (bad credentials, network failure, unexpected shape) gets its own distinct error state, never silently rendered as "no events."

### Phase 7 — page + nav

- `app/(app)/history/page.tsx` — session-gated like every other page under `(app)`, renders the two-tab layout (reuse this app's existing tab-switch pattern from `SettingsTabs.tsx`).
- `components/AppShell.tsx` — append to `NAV_ITEMS`:
  ```typescript
  { href: "/history", label: "History", icon: (<svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6">...</svg>) },
  ```
  (a clock/list-style icon, stroke-only `currentColor`, matching the existing four entries' style — placed last, after Workflows.)

### Phase 8 — docs

- `CLAUDE-CONCEPT.md`: new `## 19. History — API call log + EPCIS events, added 2026-09-02` section covering the `ApiCallLog` model, the redaction rule (never store a raw secret, ever), the 500-row-per-user retention / 100-row display split, the per-owner attribution model (interactive caller vs. BL-074b-resolved cron owner), the human-readable label table above (spec-sourced vs. hand-written, clearly marked), and the EPCIS tab's real contract. New `§7.9 EPCIS Core API` section recording the real request contract (already drafted, see `CLAUDE-CONCEPT.md`) — **update it with the real response shape found in Phase 6's Step 0 probe**, since that part is still genuinely unknown as of this prompt. Add a dated §13 decision-log entry recording this as Luc's direct request plus the judgment calls flagged in this prompt's Task section, including whatever Step 0 actually found.
- `BACKLOG.md`: **BL-076** (endpoint call history) and **BL-076a** (EPCIS events, real implementation) — check off both on completion, noting in BL-076a's completion line what the real response shape turned out to be and whether the `premise`/`Location.code` correspondence held.

### Verify

- Insert a real Bartender API key locally, trigger at least one call through each of the 10 refactored sites (a location list, a device heartbeat tick, a workflow firing, a serialization mint, a legacy product list, the legacy floor-map fetch), then inspect the resulting `ApiCallLog` rows directly in the DB — confirm **no row anywhere contains a raw `apikey` or `Authorization` value**, only the placeholder.
- Confirm a >20KB request/response body is truncated with the byte-count note, and the legacy floor-map fetch's row shows the binary placeholder, never a body.
- Confirm retention: seed >500 rows for one test user, trigger one more call, confirm the row count settles back to 500 (oldest pruned).
- Confirm cross-user isolation: `GET /api/history/calls/[id]` for another user's row returns 404, not the data.
- Re-verify (existing E2E suite green, plus a live sandbox smoke-test if convenient) after each of the 9 remaining call-site refactors individually — this item touches every live Bartender integration path in the app, a mistake in one file shouldn't be discovered only after all nine are done.
- `History` appears in the left nav for every signed-in, approved role; the Endpoint-calls tab shows real data with working detail modal + both copy buttons.
- EPCIS tab: confirm the unfiltered call returns real events (matching Luc's second `curl` example's filter set exactly, minus `premise`); confirm selecting a specific Location adds the `premise` filter and the `premise` value genuinely narrows the results (not just "returns fewer by coincidence" — cross-check against a known event's actual `premise` value from Step 0's probe); confirm the Reload button re-fires the query; confirm a real Bartender error (e.g. temporarily wrong credentials) surfaces as a distinct error state, not a false "no events" empty state. As a nice end-to-end sanity check, fire a workflow (BL-063 already pushes real reads) and confirm the resulting event shows up in this tab shortly after.
- Existing E2E suite still green.

### Conventions

- Branch `staging`.
- New backlog item, no letter suffix → `npm version minor --no-git-tag-version` (covers both BL-076 and BL-076a in the same bump).
- Check off `BACKLOG.md` BL-076 and BL-076a with short completion notes each (BL-076a's should record the real response shape found and whether the `premise` correspondence held, since both were open questions at prompt-writing time).
