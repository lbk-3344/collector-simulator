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

**Settings**: a `/settings` area accessible to every signed-in user, tabbed. The first tab, **Users**, only renders for `ADMIN` (hidden entirely for `USER`, not just disabled/greyed out — mirrors Supplier Connect's `isBrandAdmin` gate, both server-side on the API routes and client-side on the tab list). The second tab, **Bartender Connection** (added 2026-08-27, see section 7.1 below), is open to **every** role including `PENDING` — deliberately not admin-gated, since each user configures their own connection rather than a shared org-wide one.

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

**First real API provided 2026-08-27** — see 7.1/7.2 below. Everything else is still incremental, one API at a time, as Luc provides it.

### 7.1 Per-user connection settings (prerequisite for all Bartender calls)

**Decided 2026-08-27.** Every call this simulator makes to the Bartender Track & Trace platform is authenticated per-user, not per-org: each signed-in user — **any role, including `PENDING`**, not just `ADMIN` — configures their own connection in **Settings → Bartender Connection** (see section 4):

- **Tenant URL** — the base URL of the user's Bartender tenant, e.g. `https://demotrackandtrace.sandbox.bartender-tt.com`. Different users may point at different tenants (sandbox vs. a client's tenant, different demo environments) — this is why it's per-user rather than a single app-wide setting.
- **API key** — sent as the `apikey` request header on every call to that tenant (see 7.2 for a confirmed working example). **Stored encrypted at rest** (AES-256-GCM, server-side `ENCRYPTION_KEY`) — decided 2026-08-27 given this key grants real access to a Bartender tenant. The UI never re-displays the plaintext key after saving; it shows only the last 4 characters, and the user must re-enter the full key to change it.
- **Test connection**: Settings offers a "Test connection" action that calls the Locations API (7.2) server-side with the entered (or already-saved) credentials and reports success (with a location count) or a clear error — this is the mechanism a user uses to confirm their tenant URL + key actually work, and doubles as the first live proof this integration works end to end.

Data model: two new fields on `User` (`bartenderTenantUrl`, `bartenderApiKeyCiphertext`) plus a `bartenderApiKeyLast4` convenience field for masked display — see `BACKLOG.md` BL-032.

### 7.2 Locations (sites) API

**Provided by Luc 2026-08-27** — the first concrete Bartender endpoint, and the one used to implement "Test connection" above.

- **Purpose**: returns the locations (sites) configured for the calling tenant.
- **Method / path**: `GET {tenantUrl}/statemachine-api-configuration/rest/configuration/locations?level=premise`
- **Auth**: header `apikey: <the user's API key>` (not `Authorization: Bearer` — a plain custom header named `apikey`).
- **Confirmed working example** (Luc's sandbox tenant):
  ```
  curl --location 'https://demotrackandtrace.sandbox.bartender-tt.com/statemachine-api-configuration/rest/configuration/locations?level=premise' \
  --header 'apikey: XCONEBOUVGDPDIOD'
  ```
- **Response shape** — **confirmed 2026-08-27** against the sandbox tenant (33 locations returned): a **plain JSON array** of location objects (not wrapped in `{ data: [...] }` or similar), each shaped like:
  ```json
  {
    "id": 59414424685263,
    "code": "TTMEMBASE",
    "name": "T&TMembase",
    "level": "premise",
    "type": "dc",
    "latitude": 35.06612,
    "longitude": -89.955986,
    "sgln": null,
    "bizLocation": "urn:mjx:site:loc:DEMOTT.00005.0",
    "bizLocationRegularizer": "urn:mjx:site:loc:DEMOTT.00005.0",
    "hotspotZOffset": 0,
    "attributes": "asn_auto_on,inventory_app_flow_transferout_receiving",
    "addressLine1": "", "addressLine2": null, "addressLine3": null,
    "addressPostalCode": "", "addressCity": "Memphis", "addressState": "TN", "addressCountry": "USA",
    "hierarchy": { "organizationId": 1000, "premiseId": null, "floorId": null, "areaId": null, "zoneId": null },
    "parent": 1000
  }
  ```
  `type` seen so far: `dc`, `store`, `factory`, `customer` — likely an open set, not a fixed enum. `attributes` is a comma-separated string or `null`, not an array. `id`/`parent` are numbers (large enough that they don't fit a 32-bit int). Only used today for a location **count** ("Test connection" — BL-033); if a `Location`/`Site` concept is ever needed for BL-003, model against this shape directly rather than re-deriving it.
- **Error behavior** — confirmed against the same sandbox tenant: an invalid `apikey` returns **HTTP 401** with a plain-text body `Unauthorized` (not JSON). A malformed/unreachable tenant URL fails at the network level (DNS/connection error) before any HTTP status is returned — handle both distinctly rather than a single generic "failed" message (see `app/api/settings/bartender/test/route.ts`).
- **Other query levels**: the `level=premise` parameter implies other levels likely exist (e.g. a site hierarchy) — not explored yet, out of scope until needed.

### 7.3 Location/Zone management API (`location-api-v2`) — provided 2026-08-27, gateway/auth corrected and confirmed working same day

A second, much more complete Location-related API spec, added directly to the claude.ai Project as `location-api-v2 (1).yaml`. Full CRUD for **Locations** (sites), **Zones** (named points on a Location's floor plan, each carrying a business purpose via `ZoneType`), **Location Types**/**Zone Types** (read-only reference/classification data), floor-plan image upload/retrieval, **Channel Mappings** (links one of Bartender's own registered `DataCollector` Channels to a Zone — **not** the same thing as this app's own simulated `Device` concept, see section 14.2), and CSV bulk import/export.

**Gateway architecture**: unlike the `statemachine-api-configuration` endpoint (section 7.2), which is reached at the user's own per-tenant subdomain (`{tenantUrl}/...`), `location-api-v2` (and the platform's `DataCollector` API, not yet documented here) are reached through **one of two fixed API gateways**, not the tenant URL directly:

- **Production gateway**: `https://api.bartender-tt.com`
- **Sandbox gateway**: `https://api.sandbox.bartender-tt.com` — **corrected 2026-08-27**; Luc's first pass called this the "staging" gateway at `api.staging.bartender-tt.com` (that host doesn't work — see the dead end noted below), the real second gateway is for **sandbox** environments.

**Which gateway to call is derived from the user's stored `bartenderTenantUrl`** (not stored separately): if it contains `sandbox` (e.g. `https://demotrackandtrace.sandbox.bartender-tt.com`, the tenant used for every live test in this section), use the sandbox gateway; otherwise use the production gateway. Implemented as `resolveGatewayUrl(tenantUrl): string` in `lib/bartenderLocations.ts`.

**Auth**: the **lowercase `apikey` header** — same header as section 7.2's `statemachine-api-configuration` endpoint, **not** `X-API-Key` as the original spec text implied. Confirmed 2026-08-27 by live-testing both header names against both gateways with the sandbox tenant's key (`XCONEBOUVGDPDIOD`, confirmed working for section 7.2):

- `https://api.staging.bartender-tt.com/locations` (the old, wrong gateway guess) — unreachable regardless of header: TLS handshake stalls after the server sends its certificate, no response ever comes back. Infrastructure/cert issue on that host, or simply not a real endpoint — moot now that the correct host is known.
- `https://api.bartender-tt.com/locations` (production gateway, wrong for a sandbox tenant) — `401` with either header. Expected: a sandbox key isn't valid on the production gateway.
- `https://api.sandbox.bartender-tt.com/locations` with `X-API-Key` — `401`, `{"message":"apikey or basic auth is required"}` (header not recognized).
- `https://api.sandbox.bartender-tt.com/locations` with `apikey` (lowercase) — **`200`, 33 locations returned.** This is the working combination.

Key points relevant to this app, confirmed against the live response shapes (not just the spec text):
- `GET /locations` — returns a **paginated envelope**, `{ page, total, pageSize, locations: [...] }`, not a bare array. Each location has `code`, `name`, `type` (`DC`/`FACTORY`/`STORE`/`SUPPLIER`/`CUSTOMER`), `address`/`zipcode`/`city`/`state`/`country`, `lat`/`lng`, `hasMap` (boolean), `zoneCount`, plus some fields this app doesn't use (`sgln`, `bizLocation`, `createdAt`/`updatedAt`).
- `GET /locations/{code}/zones` — returns `{ locationCode, zones: [...] }`. Each zone's own identity is under `zoneCode`/`zoneName` — confusingly, `code`/`name` on the same entry are the **parent location's**, repeated on every zone. Each zone has a `position` (`{x, y}` pixel coordinates on the floor-plan image) and a `type` (nullable) driving default EPCIS semantics. Live-tested against `TTMEMBASE` — 200, real zone data.
- `GET /locations/{code}/map` — floor-plan image metadata (`mapUrl`, `width`, `height`) when `hasMap` is true. Live-tested against `TTMEMBASE` (`hasMap: true`) — returned **`403`, plain-text `Access Denied. Not Authorized to use the resources: Local Map[read]`**, a permission-scope gap on this specific key, distinct from the already-handled `404` "no map for this location type" case. Not something this app can fix; the client surfaces it as a normal gateway error rather than silently treating it as "no map".

**Implication for BL-036–039**: `lib/bartenderLocations.ts` (`resolveGatewayUrl`/`listLocations`/`getLocationMap`/`getLocationZones`) is updated to the corrected gateway/header/response-shape findings above and live-verified for `/locations` and `/locations/{code}/zones`. The Site selector card and the Location map card's zone markers should now work end-to-end against Luc's sandbox tenant; the floor-plan image itself will still show the card's "couldn't load" state until the API key's Local Map read permission is granted on Bartender's side.

### 7.4 Legacy floor-plan map retrieval (Basic Auth) — temporary workaround, added 2026-08-28, live-verified same day

**Context**: section 7.3's `GET /locations/{code}/map` (`location-api-v2`) returns `403 Local Map[read]` for the current API key — a real permission-scope gap on Bartender's side, not something fixable from this app. Luc identified an alternate, older path to the same floor-plan image, using the already-integrated `statemachine-api-configuration` API (section 7.2) plus a second endpoint that only accepts a different auth scheme.

**1. Find the floor sub-location for a site.** `GET {tenantUrl}/statemachine-api-configuration/rest/configuration/locations?level=floor`, header `apikey: <user's key>` — identical auth to section 7.2's `level=premise` call, just a different `level`. Returns the tenant's floor-level locations (sub-locations of a premise/site), shaped like section 7.2's example (`id`, `code`, `name`, `level: "floor"`, `parent`, etc.).

**Matching corrected after live-testing 2026-08-28** — the original assumption (match the floor whose `name` equals the site's `name`) **does not hold**: checked against all 3 real seeded sites and the floor's `name` mirrors its own `code`, never the premise's display name.

| premise `code` | premise `name` | matching floor `code` | floor `name` |
|---|---|---|---|
| `TTMEMBASE` | `T&TMembase` | `TTMEMBASE_FLORR` | `TTMEMBASE` |
| `TANDTWAREHOUSE` | `T&TWarehouse` | `TANDTWAREHOUSE_FLOOR` | `TANDTWAREHOUSE` |
| `GRANITEFALLSSHOP` | `Granite Falls Shop` | `GRANITEFALLSSHOP_FLOOR` | `GRANITEFALLSSHOP` |

The reliable link is **structural**, not name-based: every floor's `parent` field holds the numeric `id` of its parent premise (confirmed across all 3 rows above). So the correct lookup is: fetch `level=premise`, find the entry whose `code` matches the site, take its `id`; fetch `level=floor`, find the entry whose `parent` equals that `id`. Implemented as `findFloorForPremiseCode(tenantUrl, apiKey, premiseCode)` in `lib/bartenderLocations.ts` (supersedes the originally-planned `findFloorByName`).

**2. Fetch the map for that floor.** `GET {tenantUrl}/statemachine-api-configuration/rest/configuration/locations/{floorLocationId}/maps` — **not** the `apikey` header this time. This endpoint only accepts **HTTP Basic Auth** (`Authorization: Basic base64(username:password)`) — a Track & Trace **login + password**, a credential type separate from the API key entirely.

**Response shape confirmed live 2026-08-28** (tested against `TTMEMBASE`'s floor, id `59414593393144`, with Luc's Track & Trace username/password): **`200`, raw image bytes directly** — `Content-Type: image/png`, a real 5718×3457 floor-plan PNG, not JSON metadata. This means the browser can't be simply pointed at the tenant URL directly (it doesn't hold the Basic Auth credentials, and shouldn't be given them) — the bytes must be proxied server-side through this app's own API and streamed back with the right `Content-Type`. See `app/api/locations/[code]/legacy-map-image/route.ts`.

**New credential requirement**: this Basic Auth login/password is a new, third Bartender credential type (alongside tenant URL and API key, section 7.1) — added to Settings → Bartender Connection as **Username** / **Password** fields, reusing the exact same `.field-block` pattern already used there. Stored the same way the API key is: `bartenderPasswordCiphertext` (AES-256-GCM via `lib/crypto.ts`), `bartenderUsername` stored in cleartext like `bartenderTenantUrl`. Unlike the API key, the password gets **no masked last-4 preview** — just a "set" / "not set" indicator, since there's no legitimate reason to surface any fragment of a login password in the UI. Explicitly scoped: **only this temporary maps workaround uses Basic Auth** — every other Bartender endpoint in this app keeps using the `apikey` header.

**This is explicitly temporary.** The moment Bartender grants this API key's `Local Map[read]` permission (section 7.3), the map card should revert to calling `location-api-v2`'s own `/locations/{code}/map` directly — the floor-lookup + Basic-Auth detour goes away entirely. Leave the Username/Password fields and schema columns in place rather than ripping them out the moment that happens (harmless if unused); just log a follow-up decision-log entry here once it's confirmed the permission gap is closed and the workaround has been removed.

### 7.5 DataCollector API (`datacollector-api-v3`) — provided 2026-08-28

Added directly to the claude.ai Project as `datacollector-api-v3 (2) (2).yaml`. Defines how a real reader or software collector registers itself with Bartender and submits tag reads — this is the API this app's own simulated `Device`/"Collector" concept (section 15) is modeled after. **Not yet called live by this app** — see section 15's explicit scoping note before assuming any of this is wired up.

- **Server**: `https://api.bartender-tt.com/datacollector` — the spec lists only a "Production environment" here, unlike `location-api-v2` (section 7.3), which turned out to need a second `.sandbox.` gateway once tested live. Confirm empirically whether a sandbox equivalent exists for this API too, before ever registering a real collector against it — don't assume the production host doubles for sandbox tenants.
- **Auth**: `apikey` header, or HTTP Basic (`Authorization: Basic base64(username:password)` **plus** a required `x-tenant` header carrying the tenant code) — same two-scheme pattern as `location-api-v2` and the legacy maps endpoint (section 7.4), not yet tested against Luc's tenant for this specific API.
- **Key concepts**: a **DataCollector** is a device or app, identified by a caller-chosen `collectorId`; a **Channel** is a logical stream of observations it produces (`PRESENCE` — reports tags currently in a Zone, needs `presenceEvent`; or `DIRECTIONAL` — reports tags crossing a boundary, needs `direction`); **read point type** (`GET /reference/read-point-types`) — confirmed to be the **exact same 13-code set** already integrated as `READ_POINT_TYPES`/`ReadPointIcon` (BL-029): `PORTAL`, `CONVEYOR`, `OVERHEAD`, `SHELF`, `TABLETOP`, `ENCLOSURE`, `DOORFRAME`, `LIFT_LOBBY`, `SIMPLE_READER`, `MIDDLEWARE`, `MES`, `WCS`, `APP`. This resolves BL-029's open question for good — read-point type and this app's Device `type` are exactly the same enum, straight from Bartender's own reference data.
- **`POST /collectors/register`** — the registration payload is what section 15's `Device` model is shaped after: `collectorId` (string, unique, stable across restarts), `collectorName`, `locationId` (must match a Location's `code`), `model`, `vendor`, `readPointType`, `configVersion` (optional opaque version token), `heartbeatConfig` (`{enabled, timeoutSeconds}`, defaults `true`/`120`), `attributes` (free-form flat key/value map — string/number/boolean values only, no nesting), `channels[]` (each with `channelId`, `channelType`, `direction` **or** `presenceEvent` depending on type, `attributes`). Re-registration is idempotent on `collectorId` and replaces the whole stored Channel list.
- **`PUT /collectors/{collectorId}/heartbeat`**, **`POST /reads`** — heartbeat keepalive and tag-observation ingestion. Not modeled by this app yet — no simulated "send" capability exists (see section 15's manual-send scoping note).
- The real API's own Collector status (`ONLINE`/`OFFLINE`/`CONFIG_PENDING`, from heartbeat freshness and config-version drift) is **Bartender's** concept, entirely separate from this app's own 4-state Device visualization (section 15.3) — don't conflate the two even though both use similar-sounding words.

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

- **2026-08-28** — Channels gain an optional `name` field (BL-049a), direct follow-up from Luc right after BL-049 shipped: each Channel row's `CH1`/`CH2`… id stays the fixed, non-editable internal identifier (same id/name split as Device's own `collectorId`/`name`), and a new freeform text input lets a user label it (e.g. "Entry sensor"). Purely cosmetic/organizational — doesn't affect state derivation, validation, or the suggest-code scheme. See section 15.1 below.
- **2026-08-28** — Device Channels, Collector ID code scheme, and a publish-to-platform gate added on top of the just-shipped Devices/Collectors feature (see section 15.1/15.3/15.4 above, `BACKLOG.md` BL-049 to BL-051), direct request from Luc after seeing BL-042–047 live: (1) the v1 "single default Channel" scope decision is superseded — a Device now carries a real, repeatable Channel list, each entry set via icon toggles (Presence/Directional, then First seen/Present/Last seen or Inbound/Outbound) rather than free text, explicitly asked to be self-explanatory without needing a legend; (2) Collector ID gets an auto-suggested default following the `{site}-{TYPE}-{NN}` pattern already used informally elsewhere in this project (e.g. the legacy floor-code naming in section 7.4), always editable; (3) a new `publishedAt` field decouples "config saved" from "live on the platform" — a Device now stays grey/"Not configured" even once fully configured, until an explicit **Publish to platform** action is taken, at which point it resolves to Active/Automated/Problem exactly as before. All three remain purely local/simulated — no real Bartender DataCollector call is made anywhere in this app.
- **2026-08-28** — Devices/Collectors feature decided (see section 15 above, `BACKLOG.md` BL-042 to BL-047): a Device is redesigned to carry the fields a real Bartender Collector registration needs (section 7.5, a new API provided same day), gets a 4-state color-coded visualization (Off/Active/Automated/Problem) driven by whether it's configured and, if attached to one, its Workflow's status, and gains an Overview-map Edit mode (drag device-type icons from a floating palette to place new ones, drag existing ones to reposition) plus a dedicated Devices list page. Two explicit scope decisions made with Luc: (1) a minimal `Workflow` model (RUNNING/STOPPED only) is pulled forward now, same reasoning as BL-036 pulling Device forward from BL-003 — real workflow authoring stays section 6's job; (2) each Device gets exactly one auto-populated Channel for now, not a full multi-Channel editor. Actually calling Bartender's real DataCollector API (register/heartbeat/reads) is explicitly out of scope here — this is the local simulated model only.
- **2026-08-28** — Temporary Basic-Auth floor-plan map workaround decided (see section 7.4 above, `BACKLOG.md` BL-040/BL-041): `location-api-v2`'s own map endpoint is blocked by a permission gap on the current API key (section 7.3's `403 Local Map[read]`), so Luc identified a fallback via the older `statemachine-api-configuration` API — look up the site's `level=floor` sub-location by matching name, then call that floor's `/maps` endpoint, which requires a Track & Trace **username/password** (HTTP Basic Auth) rather than the `apikey` header used everywhere else in this app. A new, temporary third credential type, added to Settings → Bartender Connection. To be removed once the API key's map-read permission is granted and `location-api-v2`'s map endpoint works directly.
- **2026-08-27** — `location-api-v2` second gateway corrected by Luc: it's **sandbox**, not staging — `https://api.sandbox.bartender-tt.com`, selected when `bartenderTenantUrl` contains `sandbox` (not `staging.bartender-tt.com` as first documented). Combined with also switching the auth header to lowercase `apikey` (not `X-API-Key`), this is now **live-verified working** — `/locations` and `/locations/{code}/zones` both return real data against Luc's sandbox tenant; `/locations/{code}/map` returns a `403` permission-scope error for this key, unrelated to the gateway/header fix. Supersedes the "flagged, not wired up as working" conclusion in the entry directly below and in `lib/bartenderLocations.ts`'s header comment — see section 7.3 for the full corrected findings.
- **2026-08-27** — `location-api-v2` gateway architecture clarified by Luc (see section 7.3): the API is reached at one of two **fixed gateway hosts** (`https://api.bartender-tt.com` production, `https://api.staging.bartender-tt.com` staging) rather than the user's per-tenant `bartenderTenantUrl`, which was the assumption in the Overview/homepage redesign decision below when it was first written. The per-user API key is unchanged — it's what the gateway uses to resolve the correct tenant. Which gateway to call is derived from whether `bartenderTenantUrl` contains `staging.bartender-tt.com`. Updates the earlier "flagged, unresolved" note in section 7.3 and the BL-036-039 Claude Code prompt; doesn't change anything else about the Overview redesign decision.
- **2026-08-27** — Overview/homepage redesign decided (see section 14 above, `BACKLOG.md` BL-036 to BL-039): the static KPI-only Overview page is replaced with a site selector card (globe icon, selected site name + city/state/country, dropdown to switch sites, persisted per-user), a location map card (the selected site's floor plan with a floating zoom/pan widget, Zones and this app's simulated Devices drawn as icons at their pixel positions), and the KPI row narrowed to Devices/Workflows/Serialized-items (Bug reports card removed — redundant with the BL-034 Settings tab). Three explicit choices made with Luc: (1) the map shows the site's **floor plan**, not a geographic map — matches how the newly-provided `location-api-v2` positions Zones; (2) that new API (section 7.3) is the source of truth for site data going forward, even though — unlike the already-tested `statemachine-api-configuration` endpoint — it hasn't been live-tested against the sandbox tenant yet, and its auth header/base URL look different; (3) a minimal simulated `Device` model is built now (section 14.2) rather than waiting on the full BL-003 entity model, since the map needs something real to render as device markers — explicitly **not** the same thing as Bartender's own `DataCollector` concept.
- **2026-08-27** — Inline feedback ("snacks") redesign decided (see `CHARTE-GRAPHIQUE.md` "Inline feedback (snacks)", `BACKLOG.md` BL-035): the plain colored-text pattern used for save/error/test-connection messages (flagged by Luc on Settings → Bartender Connection) is replaced with a filled, rounded-rectangle component — solid semantic-color background (not the existing light tint used by `.chip`/`.error-banner`), text color chosen per-color for WCAG AA contrast rather than a single fixed choice (navy text on success/warning, white text on danger — plain white-on-green and white-on-amber both fall under the 4.5:1 AA threshold). Applies to `BartenderConnectionTab.tsx`, `UsersTable.tsx`, the login page, and `BugReportModal.tsx` — unifying four ad-hoc instances of the same pattern into one component.
- **2026-08-27** — BL-032/BL-033 implemented: Bartender Connection tab (tenant URL + AES-256-GCM-encrypted API key, masked to last 4 chars), `GET`/`POST /api/settings/bartender`, and a server-side-only `POST /api/settings/bartender/test`. Tested live against Luc's sandbox tenant — 33 locations, response shape now documented in section 7.2 below. One implementation consequence worth recording: since Bartender Connection is open to `PENDING` users too, `middleware.ts` and `app/(app)/layout.tsx` both needed a carve-out so a `PENDING` user can reach `/settings` (and its `/api/settings/*` routes) specifically, while every other route still bounces them to `/auth/pending` as before — this wasn't explicitly called out when the tab's access rule was decided, but follows directly from it.
- **2026-08-27** — First real Bartender API provided and per-user connection settings decided (see section 7.1/7.2 above, `BACKLOG.md` BL-032/BL-033): every user — any role, not just `ADMIN` — gets a **Bartender Connection** tab in Settings to enter their own tenant URL + API key, since different users may point at different Bartender tenants. The API key is **stored encrypted at rest** (AES-256-GCM via a new `ENCRYPTION_KEY` env var), never re-displayed in plaintext after saving (masked to last 4 characters). First confirmed endpoint: `GET {tenantUrl}/statemachine-api-configuration/rest/configuration/locations?level=premise` with an `apikey` header, returning a tenant's locations/sites — used to power a "Test connection" action in Settings.
- **2026-08-27** — App shell layout revised (see `CHARTE-GRAPHIQUE.md` "App shell layout", `BACKLOG.md` BL-031): top bar simplified to logo + software name only on the left and the avatar/user menu only on the right — the page title that used to live in the top bar now renders inside each page's own content area instead. The sidebar moves from a full-height column beside the top bar to sitting below it (top bar spans full width; sidebar + content sit side by side underneath), and becomes retractable: collapsed shows icon-only nav items, expanded shows icon+label, with the active item as a filled-orange pill in both states. Explicit request from Luc, correcting the original BL-028 shell.
- **2026-08-26** — Typography and background revised in Cowork (supersedes part of the 2026-08-24 design system decision; see `CHARTE-GRAPHIQUE.md`): **Inter + JetBrains Mono** replace IBM Plex Sans/Condensed/Mono, self-hosted via `@fontsource/inter` and `@fontsource/jetbrains-mono` (both v5.3.0, OFL-1.1 — same no-licensing-concern status as the Plex fonts) rather than a Google Fonts CDN link, so the fonts show up as real dependencies once this repo is linked to Claude Design via `/design-sync`. Page background (`--ground` token) changed from the warm `#FAF8F4` to plain light gray `#F4F4F5`. Orange's interactive role expanded beyond logo/eyebrows/active-nav-indicator to also cover: sidebar active-item fill (filled pill, not just a thin line), avatar-menu item hover state, category badges (`FIXED_RFID`/`SOFTWARE`), and secondary/ghost buttons — primary buttons, links, and focus rings stay navy, and semantic status colors (online/offline/error) are untouched, preserving the "semantic color ≠ brand accent" rule from the original decision. Decided from a live comparison (`design-review.html`, Cowork artifact — font pairings × background options on a mini app-shell mockup). See `BACKLOG.md` BL-030.
- **2026-08-26** — Read-point type icon set integrated: 13 line-art SVG icons (one per read-point/device type, see section 7 above and `CHARTE-GRAPHIQUE.md` "Iconography"), produced in a separate Claude Design session and delivered as `package/` at the repo root. Wired into the app as `components/ui/ReadPointIcon.tsx` (typed React component) plus raw assets under `public/icons/read-point/` (standalone SVGs, a `<symbol>` sprite, and `manifest.json`). Not a product decision on its own, but worth noting: this is the first concrete (if partial) signal of the real Bartender read-point type taxonomy, ahead of BL-002/BL-003 being formally settled — flagged for Luc to confirm whether "read-point" and this simulator's "Device" concept are the same thing or related-but-distinct.
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


## 14. Overview / Homepage — Site selection & Location map

Decided 2026-08-27, replacing the previous static-KPI-only Overview page. Full backlog items: `BACKLOG.md` BL-036 to BL-039.

### 14.1 Site selector card

The first of the four top cards on Overview. A large world/globe icon on the left; the currently selected site's name large on the right, with city/state/country in small text underneath so the whole thing fits within the card. Clicking the name opens a dropdown listing every Location from `GET /locations` (section 7.3); picking a different one updates the selection. The choice is stored per-user (new `User.selectedLocationCode` field, same pattern as `bartenderTenantUrl`) so it's remembered across sessions — defaults to the first Location returned when a user has never picked one.

### 14.2 Simulated Device model — distinct from Bartender's DataCollector

A new, deliberately minimal `Device` table: `id`, `name`, `type` (reuses the 13-code read-point type set delivered for BL-029 — this resolves that item's open question: yes, this backlog's "Device" and the read-point icon set's "read-point type" are the same concept), `locationCode` (a plain string matching a Bartender Location's `code` — not a foreign key, since Locations live in Bartender's platform, not this app's database), `positionX`/`positionY` (nullable pixel coordinates on that Location's floor plan, same coordinate system as Zone `position`), `status` (`ONLINE`/`OFFLINE`).

**Important distinction**: this is a different concept from Bartender's own `DataCollector`/`Channel`/`ChannelMapping` entities (section 7.3) — those represent physical readers/printers actually registered against a real Bartender tenant. This app's `Device` rows are local simulated fixtures used to populate the Overview map with something to look at; they are not read from or synced to Bartender. No creation/edit UI is in scope yet (BL-036 is data-model-only, plus enough of a query surface for the map to render) — devices exist for now as seed/fixture data.

**Known simplification, not yet resolved**: `Device.locationCode` isn't scoped to a particular user or tenant. If two users' Bartender tenants happened to reuse the same Location code, they'd see the same simulated devices for it. Acceptable for now since BL-004 (target users) is still open and Luc is effectively the tool's only real user today — revisit if/when the tool gets multiple users pointed at different tenants.

### 14.3 Location map card

The main card beneath the KPI row. Renders the selected site's floor plan (`GET /locations/{code}/map`) at the largest size the card allows, responsive to window size. Sites without an uploaded floor plan (`hasMap: false` — expected for `SUPPLIER`/`CUSTOMER` type locations per section 7.3) show a clear empty state instead of a broken image.

A floating control widget, anchored to the map's bottom-right corner, offers zoom in / zoom out / pan — implemented as a CSS transform (scale + translate) over the floor-plan image rather than a geographic map-tile library, since this is an indoor floor plan with pixel coordinates, not a lat/lng-based map.

Zones (`GET /locations/{code}/zones`) and this app's simulated Devices attached to the site (section 14.2) are drawn as icons at their stored pixel positions, scaled to the current zoom/pan transform. Devices use the existing `ReadPointIcon` component (BL-029).

### 14.4 Overview KPI cards revised

The other three top cards keep the existing `.stat-card` styling, narrowed to what's actually simulated: **Devices online** (from the new `Device` model, X online / Y total for the selected site), **Workflows running** (still 0 — section 6 unbuilt), **Serialized items generated** (still 0 — section 7 unbuilt). The previous fourth card, **Bug reports open**, is removed — bug reports already have a dedicated admin view (`BugReportsTable.tsx`, BL-034), so a duplicate count added nothing.

## 15. Devices / Collectors — configuration, states, map editing, device list

Decided 2026-08-28 per Luc's explicit request. A "Device" in this app effectively **is** a simulated Collector — the two terms are used interchangeably in this section, a different framing from section 14.2's earlier, explicit distinction against Bartender's own `DataCollector` platform concept. Data will eventually flow out of a configured Device either **manually** (a user clicks it and sends a one-off batch) or **automatically** through a **Workflow**. The manual-send screen itself is explicitly deferred — Luc: "on verra ça plus tard" — and actually calling Bartender's real DataCollector API (registration/heartbeat/reads, section 7.5) to publish that data for real is **out of scope for this entire batch of work**: everything below is the local simulated data model and its UI, not a live Bartender integration.

### 15.1 Device model redesign — Collector fields, single default Channel

BL-036's minimal `Device` model (`id`/`name`/`type`/`locationCode`/`positionX`/`positionY`/`status`) is extended to carry the fields a real Collector registration (section 7.5) requires, so a Device is realistic enough to eventually be registered for real:

- `collectorId` (string, unique, nullable until configured) — the Bartender-facing stable id a real registration would use.
- `name` — already existed; now understood as `collectorName`.
- `type` — already existed (`READ_POINT_TYPES`); now confirmed identical to the DataCollector API's `readPointType` enum (section 7.5).
- `model`, `vendor`, `configVersion` — new, optional strings, straight from `CollectorRegistration`.
- `heartbeatEnabled` (default `true`), `heartbeatTimeoutSeconds` (default `120`) — flattened from the API's `heartbeatConfig` object.
- `attributes` (`Json?`) — free-form scalar key/value metadata, same shape/purpose as the API's `attributes`.
- **Channels — a real, repeatable list** (revised 2026-08-28, this batch — see BL-049): `channels` (`Json?`), an array of `{ id, name?, type: "PRESENCE" | "DIRECTIONAL", presenceEvent?, direction? }` entries. `id` is a simple per-Device sequence (`CH1`, `CH2`, …) — deliberately **not** derived from `collectorId`, so Channel identity stays stable even if the Collector ID is edited later. `name` (optional, added 2026-08-28 same day, BL-049a) is a freeform editable label, e.g. "Entry sensor" — same id/name split as Device's own `collectorId`/`name`, purely organizational. `type` selects which of `presenceEvent` (`FIRST_SEEN`/`PRESENT`/`LAST_SEEN`, `PRESENCE` only) or `direction` (`INBOUND`/`OUTBOUND`, `DIRECTIONAL` only) applies. A brand-new Device still starts with exactly one auto-added `PRESENCE`/`PRESENT` Channel — same zero-extra-clicks default as v1 — but the config screen (15.4) now supports adding, editing, and removing further Channels; at least one is always required. Kept as a flat JSON array rather than a proper `Channel` table, same reasoning as `attributes`: nothing here needs cross-Device Channel querying yet, and it keeps this a single-column migration. **Supersedes** the "single default Channel, not user-edited" v1 scope decision originally recorded here.
- **`collectorId` is now auto-suggested** (added 2026-08-28, BL-050): once Read point type and Site are both set and the field is empty, the config screen proposes `{locationCode}-{TYPE}-{NN}` (e.g. `TTMEMBASE-PORTAL-02`) — `NN` a 2-digit sequence, next-available per Site+Type pair across *all* Devices (configured or still a bare shell, so numbers never collide with an in-progress one). Purely a starting suggestion — always freely editable or replaceable, never enforced or validated as unique beyond the DB's own `@unique` constraint on the column.
- `configured` (boolean, default `false`) — unchanged from v1: **explicitly set**, not derived from `collectorId`'s presence, becomes `true` once the config screen's (15.4) required fields are saved.
- **`publishedAt` (`DateTime?`, added 2026-08-28, BL-051)** — null until the Device is explicitly **published to the platform** (15.4). This, not `configured` alone, is what the 4-state model (15.3) now gates its grey/not-grey boundary on: a Device can be fully `configured` and still show as grey "Not configured" until someone actually publishes it — matching Luc's own framing that "not configured" means *not live on the platform yet*, regardless of whether the form itself is complete. No real Bartender call happens on publish; it's a local, simulated status flip with a timestamp, nothing more.
- `workflowId` (nullable, FK to the new `Workflow` model, 15.2) + relation.
- `locationCode`/`positionX`/`positionY` unchanged from BL-036.
- The old `status: DeviceStatus` (`ONLINE`/`OFFLINE`) field and `DeviceStatus` enum are **removed** — superseded entirely by the derived 4-state model (15.3), which factors in `configured` and `workflow.status` rather than a flat online/offline flag.

This is a breaking schema change to BL-036's `Device` table — existing seeded fixture rows need re-seeding with real values for the new required-shaped fields (Channel defaults), not a mechanical column rename.

### 15.2 Minimal `Workflow` model — pulled forward from section 6

**Explicit choice made with Luc**: rather than a cosmetic "in a workflow" flag on Device, a real (if intentionally minimal) `Workflow` model is introduced now — same reasoning as BL-036 pulling `Device` forward ahead of BL-003. This is **not** the real workflow engine (section 6, still fully open — step chains, device assignment logic, execution) — just enough of a `Workflow` entity that (a) a Device can be genuinely attached to one via `workflowId`, and (b) that workflow can be `RUNNING` or `STOPPED`, which is what drives the Automated/Problem device states (15.3):

```prisma
enum WorkflowStatus {
  RUNNING
  STOPPED
}

model Workflow {
  id        String         @id @default(cuid())
  name      String
  status    WorkflowStatus @default(RUNNING)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  devices Device[]
}
```

No Workflow creation/editing UI is in scope here — Workflows exist for now only as seed/fixture data (a couple of named fixtures, one `RUNNING` and one `STOPPED`, so the config screen's Workflow picker and all four device states are demonstrable end to end). Real Workflow authoring is section 6's job, whenever it's tackled.

### 15.3 Device state — four colors, derived not stored

A pure function (`lib/deviceState.ts`, not a stored column) computes one of four states from `configured`, `publishedAt`, and `workflow?.status`. **Revised 2026-08-28 (BL-051)**: gating moved from `configured` alone to `configured && publishedAt` — a Device can have a complete, saved configuration and still read as grey "Not configured" until it's actually been published (15.4).

| State | Condition | Color |
|---|---|---|
| **Off** ("Not configured") | `!configured \|\| !publishedAt` | Dark gray (`--device-off`) |
| **Active** | `configured && publishedAt && !workflowId` | Green (`--device-active`) |
| **Automated** | `configured && publishedAt && workflow.status === "RUNNING"` | Lighter green (`--device-automated`) |
| **Problem** | `configured && publishedAt && workflow.status === "STOPPED"` | Red (`--device-problem`) |

Used everywhere a Device renders as a colored marker or badge: the Overview map (15.5/15.6) and the Devices list (15.7). See `CHARTE-GRAPHIQUE.md` "Device states" for exact token values.

**Consequence for BL-039's "Devices online" KPI**: redefined as the count of devices in the **Active** or **Automated** state (i.e. configured, regardless of workflow) out of the site's total device count — the binary `ONLINE`/`OFFLINE` status this KPI originally read no longer exists (15.1).

### 15.4 Device config screen

A modal (same structural pattern as `BugReportModal.tsx`), opened from three places: dropping a palette icon on the map (15.5 — type + position pre-filled), clicking an existing Device marker on the map, either in Edit mode or in its Off state outside Edit mode (15.6 — editing that Device), and the Devices list's "+ Add device"/row-edit actions (15.7 — nothing pre-filled except an explicit Site picker, since there's no map-drop position to infer it from).

Fields, top to bottom: Collector ID (auto-suggested per 15.1/BL-050, always editable), Name, Read point type (icon+label — editable only when not already implied by which palette icon was dragged), Site (editable only when opened from the Devices list), Model, Vendor, Config version, Heartbeat (enabled toggle + timeout seconds), Attributes (freeform add/remove key-value rows), **Channels** (repeatable, icon-driven — see below and `CHARTE-GRAPHIQUE.md` "Device config screen"), Workflow (select — "None" or one of the seeded `Workflow` fixtures, 15.2). A small live state pill (15.3's dot+label) sits near the top of the modal, so the Device's current status is visible without closing the screen to check the map or list. Canceling a config screen opened for a **brand-new** Device (just dropped, never previously configured) deletes that just-created shell row rather than leaving an orphaned unconfigured Device on the map; canceling while editing an already-configured Device leaves it unchanged.

**Channels (added 2026-08-28, BL-049)** — a repeatable list, each row an icon-driven pair of choices rather than free text: a Type toggle (Presence vs. Directional) and, depending on that choice, either a Presence-event toggle (First seen / Present / Last seen) or a Direction toggle (Inbound / Outbound). Exact icon set and layout in `CHARTE-GRAPHIQUE.md` "Device config screen". A "+ Add channel" link (same pattern as Attributes' "+ Add attribute") appends a new row defaulted to Presence/Present; each row has a remove action, disabled on the last remaining Channel — at least one is always required.

**Publish to platform (added 2026-08-28, BL-051)** — the modal's footer changes depending on `publishedAt`. An unpublished Device (new, or previously saved as a draft) shows three actions: Cancel, **Save draft** (persists fields, `publishedAt` untouched — stays grey), and **Publish to platform** (primary, persists the same fields and additionally sets `publishedAt` to now — the Device immediately becomes Active or Automated/Problem per 15.3, depending on whether a Workflow is attached). An already-published Device shows just Cancel + **Save** — routine edits to a live Device persist immediately without a separate republish step; `publishedAt` isn't cleared by editing. Nothing about this hits a real Bartender endpoint — see the framing note at the top of section 15.

### 15.5 Overview map — Edit mode

A toggle button on the Location map card (near the existing zoom/pan widget) switches the card into **Edit mode**. While on:

- A floating palette (`CHARTE-GRAPHIQUE.md` "Device type palette") appears, listing all 13 read-point-type icons as drag sources.
- Dragging a palette icon onto the map creates a new Device at the drop position (converted from screen coordinates to floor-plan pixel coordinates by inverting the map's current pan/zoom transform — the same math the existing Zone/Device marker rendering already needs) with that `type`, the current site's `locationCode`, and `configured: false` — then immediately opens the config screen (15.4) to complete it.
- Existing Device markers become drag targets **for repositioning only** — dropping one elsewhere on the map updates just `positionX`/`positionY`, nothing else, no config screen ("sans conséquences sur sa configuration" — Luc's own words).
- Clicking (not dragging) an existing Device marker while in Edit mode opens the config screen for that Device — creation and editing both happen through the same palette/map surface.
- Turning Edit mode off hides the palette and returns marker clicks to their normal, non-edit behavior (15.6).

Recommend implementing the drag interactions with pointer events (mousedown/mousemove/mouseup), matching the map card's existing custom pan implementation, rather than the HTML5 Drag-and-Drop API, which behaves inconsistently over a CSS-transformed (scaled/panned) drop target.

### 15.6 Overview map — non-Edit-mode click behavior

Clicking a Device marker when Edit mode is off:

- **Active** (configured, no workflow) → opens the manual data-send screen. **Explicitly deferred by Luc** ("on verra ça plus tard") — for now, a placeholder modal (device name/Collector ID, a "Coming soon" note) stands in for it; no actual send capability exists yet.
- **Off** (not configured) → opens the config screen (15.4), so an incomplete Device can be finished without switching to Edit mode.
- **Automated** or **Problem** (in a workflow) → opens a read-only info panel (Device fields + the workflow's name/status) — no edit action from here, to avoid casually altering a Device that's actively part of a (simulated) running workflow; editing one of these goes through the Devices list instead (15.7).

### 15.7 Devices list page

Replaces the current `app/(app)/devices/page.tsx` placeholder. A **tenant-wide** table (all sites, not just the selected one — mirrors the real DataCollector API's own two-tier listing, `GET /collectors` tenant-wide vs. `GET /locations/{code}/collectors` site-scoped, section 7.5) — columns: read-point-type icon, Name (+ Collector ID beneath, small), Site (resolved from `locationCode` via the same site list `SiteSelectorCard` already fetches), State (15.3's colored dot + label), Workflow (name, or "—"), row actions (Edit → config screen, Delete → confirm then remove). A "+ Add device" button opens the config screen with an explicit Site field (since there's no map-drop position to infer it from) — the created Device has no `positionX`/`positionY` until someone later drags it into place via the Overview map's Edit mode.
