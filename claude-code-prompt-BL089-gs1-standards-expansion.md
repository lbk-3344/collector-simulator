# BL-089 — GS1 standard expansion for `NEW` Item Feeds

## Context

Full spec: `CLAUDE-CONCEPT.md` §7.6's "GS1 standard expansion (BL-089, 2026-09-17)"
subsection (the API contract — read it first, in full) + §16.1/§16.10 (the
`ItemFeed` field list and form design) + §13's 2026-09-17 decision-log entry.
`BACKLOG.md`'s "GS1 standard expansion" section has the short version.

Direct request from Luc: enable minting via **any** GS1 standard the platform
supports, not just `sgtin-96`/`sgtin-198`. He pasted the live response of
`GET /gs1/standards` — 8 standards. This resolves BL-073a's long-open flag
("grai-96/sscc-96/giai-96 need a data-model conversation first") and extends
it to `gid-96` and two new TDS-2.0 standards (`dsgtin-plus`/`dsgtin-plus-plus`)
that didn't exist when BL-073a was written.

**Read the full `serialization-api-v3-updated (3).yaml`** (project doc) before
starting — this prompt assumes you have. The formal `Gs1Standard` enum in
that spec lists only 7 values; `gid-96` is missing from it despite being in
the endpoint's own examples **and** in Luc's live paste. Build `gid-96`
anyway (Luc explicitly asked for "any of the supported format" and the live
endpoint lists it), but **live-verify `POST /gs1/gid-96/generate` actually
works** early in Phase 2 below, before wiring the UI around it — if it 404s
`STANDARD_NOT_FOUND`, stop and flag that back rather than shipping a form
field for a call that can never succeed.

**Everything else the spec's enum description text names** (`grai-170`,
`giai-202`, `sgln-96`/`195`, `gsrn-96`/`gsrnp-96`, `gdti-96`/`113`, `sgcn-96`,
`cpi-96`/`var`, `itip-198`, `pgln-96`) is **out of scope** — not in Luc's
live list, not in the formal enum, example-fixtures only in the spec. Don't
build fields for these.

This app still only ever requests `formats: ["hex"]` (unchanged from BL-073)
— every one of the 8 standards supports it, so no `formats` picker is
needed anywhere in this build.

## Task 1 — `prisma/schema.prisma`: new `ItemFeed` columns

All nullable, all populated only when relevant (mirrors how `gs1Standard`
already works today):

```prisma
model ItemFeed {
  // ...existing fields unchanged...

  // NEW only, standard-specific input fields (BL-089, 2026-09-17). Only the
  // fields for the currently-selected gs1Standard are ever non-null.
  companyPrefix        String? // sscc-96 / grai-96 / giai-96 — 6-12 digits
  extensionDigit       String? // sscc-96 — single digit, default "0"
  assetType            String? // grai-96
  itemReference        String? // giai-96 ("individual asset reference")
  generalManagerNumber String? // gid-96
  objectClass          String? // gid-96

  gs1Filter Int? // every NEW standard — 0-7, no platform default, always sent explicitly

  // dsgtin-plus / dsgtin-plus-plus only
  gs1LotMode          String? // "AUTO" (default) | "FIXED"
  gs1LotCode          String? // only meaningful when gs1LotMode = "FIXED", <=20 chars
  gs1DateField        String? // "expirationDate" | "bestBeforeDate"
  gs1ShelfLifeDays    Int?    // duration; the real ISO date is computed at fire time
  gs1CustomDomainName String? // dsgtin-plus-plus ONLY, required for that standard
}
```

`npx prisma migrate dev --name gs1_standard_expansion`.

## Task 2 — `lib/itemFeed.ts`: types + validation

- Widen `ItemFeedRecord.gs1Standard`'s effective value set in comments/types
  from `null | "sgtin-198"` to all 8 ids (still a plain `string | null` at
  the type level — no need for a literal union if that's awkward against the
  Prisma-generated types, your call). Add the new fields to `ItemFeedRecord`.
- Add a small internal helper distinguishing **GTIN-based** standards
  (`sgtin-96`, `sgtin-198`, `dsgtin-plus`, `dsgtin-plus-plus`) from
  **non-GTIN** standards (`sscc-96`, `grai-96`, `giai-96`, `gid-96`) — both
  `buildItemFeedData` and the mint path need this distinction, worth one
  shared source of truth (e.g. a `GTIN_BASED_STANDARDS` Set exported from
  `lib/itemFeed.ts` or `lib/bartenderSerialization.ts` — your call which
  file reads better, just don't duplicate the list).
- In `buildItemFeedData`, inside the existing `kind === "NEW"` branch, add a
  nested branch on `gs1Standard` (normalize first: anything not one of the 8
  known ids → `"sgtin-96"`, same posture as today's sgtin-96/sgtin-198
  normalization):
  - **GTIN-based** — unchanged: needs ≥1 GTIN (existing check).
  - **`sscc-96`** — needs `companyPrefix` (regex `/^\d{6,12}$/` — 422
    `INVALID_...` from the platform if this app doesn't catch it first, so
    catch it here); `extensionDigit` defaults to `"0"` if empty, else must be
    a single digit `/^\d$/`.
  - **`grai-96`** — needs `companyPrefix` (same pattern) + non-empty `assetType`.
  - **`giai-96`** — needs `companyPrefix` (same pattern) + non-empty `itemReference`.
  - **`gid-96`** — needs non-empty `generalManagerNumber` **and**
    `objectClass` — no `companyPrefix` at all for this one.
  - **`dsgtin-plus` / `dsgtin-plus-plus`** — needs ≥1 GTIN (same as sgtin),
    plus:
    - `gs1DateField` must be `"expirationDate"` or `"bestBeforeDate"` (default
      to `"expirationDate"` if missing — pick whichever reads better as a
      default, not a strong opinion either way).
    - `gs1ShelfLifeDays` must be a non-negative integer (0 is valid — "expires
      today"); reject negative/non-numeric.
    - `gs1LotMode` normalizes to `"FIXED"` only if explicitly that value,
      else `"AUTO"`. If `"FIXED"`, `gs1LotCode` must be non-empty and ≤20
      chars; if `"AUTO"`, clear `gs1LotCode` to `null` regardless of what was
      sent (it's generated at fire time, nothing to store).
    - `gs1CustomDomainName`: **required, non-empty** when
      `gs1Standard === "dsgtin-plus-plus"`; **cleared to `null`** when
      `gs1Standard === "dsgtin-plus"` even if the request body still carries
      a value from a previous save (switching standards must not leave a
      stale domain name lying around that the platform then rejects with
      `UNSUPPORTED_FIELD_FOR_STANDARD`).
  - **`gs1Filter`** (every `NEW` standard) — clamp to `[0, 7]` if a number is
    given and out of range, rather than 400ing (a bad pre-fill shouldn't
    block saving); default per standard if missing entirely:
    `sgtin-96`/`sgtin-198`/`dsgtin-plus`/`dsgtin-plus-plus` → `3`,
    `sscc-96` → `0`, `grai-96`/`giai-96` → `6`, `gid-96` → `0` (flagged
    unconfirmed — see Task 6's live-verify note).
- Every field not relevant to the resolved `gs1Standard` is written back as
  `null` in the returned `data` object — same discipline the existing code
  already applies to `gtins`/`categoryCode`/`presentMatchMode` etc. per kind.

## Task 3 — `lib/bartenderSerialization.ts`: per-standard mint + lot/date helpers

- **Widen the `Gs1Standard` type** to the full 8-value union:
  `"sgtin-96" | "sgtin-198" | "sscc-96" | "grai-96" | "giai-96" | "gid-96" | "dsgtin-plus" | "dsgtin-plus-plus"`.
- **New exported helper — lot code generator**:
  ```ts
  export function generateLotCode(now: Date = new Date()): string {
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const suffix = Array.from({ length: 3 }, () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 33)]
    ).join("");
    return `L${yy}${mm}${dd}-${suffix}`;
  }
  ```
  (Alphabet excludes visually-confusable `I`/`O`/`0`/`1` — a nice-to-have,
  not a hard requirement; plain `A-Z0-9` is fine too if that table feels like
  overkill. Exported so it's unit-testable and so `ItemFeedForm`'s "Suggest"
  button can... actually no — the suggest button is server-unaware, see
  Task 4, it doesn't call this directly since this lives in a server-only
  module. Either duplicate a tiny version client-side for the Suggest button,
  or add a small `GET`/`POST` endpoint that returns one — your call, a
  duplicate 6-line function is probably less work than a new route for this.)
- **New exported helper — shelf-life-to-ISO-date**:
  ```ts
  export function computeGs1Date(shelfLifeDays: number, now: Date = new Date()): string {
    const d = new Date(now.getTime() + shelfLifeDays * 86_400_000);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  ```
- **Rework `generateGs1`** (currently `(userId, tenantUrl, apiKey, standard, gtin, quantity)`)
  to accept a richer options bag instead of a bare `gtin`, since most of the
  8 standards don't have one. Something like:
  ```ts
  interface Gs1MintOptions {
    userId: string;
    tenantUrl: string;
    apiKey: string;
    standard: Gs1Standard;
    quantity: number;
    filter: number; // 0-7, always sent explicitly now — see below
    // GTIN-based only:
    gtin?: string;
    // non-GTIN only:
    companyPrefix?: string;
    extensionDigit?: string;
    assetType?: string;
    itemReference?: string;
    generalManagerNumber?: string;
    objectClass?: string;
    // dsgtin-plus / dsgtin-plus-plus only:
    context?: { lotCode?: string; [dateField: string]: string | undefined };
    customDomainName?: string;
  }
  ```
  Build the `input` object per standard inside `generateGs1` (or a small
  `buildGs1Input(opts)` helper it calls) — GTIN-based sends
  `{ gtin, companyPrefixLength: DEFAULT_COMPANY_PREFIX_LENGTH }` (unchanged
  for sgtin; DSGTIN sends `{ gtin, context }`, **no** `companyPrefixLength` —
  the spec is explicit that DSGTIN doesn't use partition tables); `sscc-96`
  sends `{ companyPrefix, extension: extensionDigit }`; `grai-96` sends
  `{ companyPrefix, assetType }`; `giai-96` sends `{ companyPrefix, itemReference }`;
  `gid-96` sends `{ generalManagerNumber, objectClass }`. Always include
  `filter` in the request body now (the API has no default — this is a real
  behavior change from the current client, which never sent `filter` at
  all... verify against a real call whether omitting `filter` today has been
  silently defaulting or erroring; if it's been silently working, that's the
  platform being lenient and we should still start sending it explicitly per
  the documented contract).
- **Rework `mintSerializedItems`** — it currently takes `gtins: string[]` and
  always assumes GTIN-based routing. Branch on whether `standard` is
  GTIN-based:
  - **GTIN-based** (`sgtin-96`/`sgtin-198`/`dsgtin-plus`/`dsgtin-plus-plus`):
    keep today's logic (assign each unit a random GTIN from the list, group,
    one `generateGs1` call per distinct GTIN) — but for the two DSGTIN
    standards, compute the lot code and ISO date **once per firing** (not
    once per GTIN group) via the Task 3 helpers, and pass the *same*
    `context` object into every one of that firing's `generateGs1` calls, so
    a mixed-GTIN DSGTIN batch shares one lot/date across the whole firing.
  - **Non-GTIN** (`sscc-96`/`grai-96`/`giai-96`/`gid-96`): **one**
    `generateGs1` call for the whole (already-capped) quantity, using that
    standard's own fields; return `{ gtin: null, epc }[]` for every item —
    `itemGtins` all `null`, exactly like `FIXED`'s existing convention.
  - The function's new signature needs the caller (`resolveBatch` in
    `lib/workflowRun.ts`) to pass through the whole `ItemFeed` row's
    standard-specific fields, not just `gtins` — update the call site
    accordingly (see Task 4). Consider taking the whole `feed` object (or a
    thin subset of it) rather than growing the positional-argument list
    further — your call on the exact shape, but a long positional-parameter
    function that already has 6 params and is about to need ~8 more is a
    good sign an options object is overdue here too.

## Task 4 — `lib/workflowRun.ts`: `resolveBatch()`

Update the `feed.kind === "NEW"` branch (around the existing
`mintSerializedItems(ownerId, creds.tenantUrl, creds.apiKey, gtins, quantity, feed.gs1Standard === "sgtin-198" ? "sgtin-198" : "sgtin-96")`
call) to:
- Normalize `feed.gs1Standard` against the full 8-value set (default
  `"sgtin-96"` for anything unrecognized — same posture as today).
- Pass through whatever of `feed.companyPrefix` / `feed.extensionDigit` /
  `feed.assetType` / `feed.itemReference` / `feed.generalManagerNumber` /
  `feed.objectClass` / `feed.gs1Filter` / `feed.gs1LotMode` / `feed.gs1LotCode`
  / `feed.gs1DateField` / `feed.gs1ShelfLifeDays` / `feed.gs1CustomDomainName`
  is relevant to the resolved standard, into the reworked
  `mintSerializedItems` call from Task 3.
- For GTIN-based standards, `gtins.length === 0` still short-circuits with
  the existing "NEW feed has no GTIN" note — unchanged. For non-GTIN
  standards, add the equivalent guard (missing `companyPrefix` for the three
  that need it, missing `generalManagerNumber`/`objectClass` for `gid-96`) —
  belt-and-suspenders on top of `buildItemFeedData`'s save-time validation,
  in case a Feed was created before this validation existed or the DB was
  touched directly.

## Task 5 — `components/ItemFeedForm.tsx`

- **Identifier-format `<select>`** (currently 2 `<option>`s under `kind === "NEW"`)
  grows to 8, grouped GTIN-based first, non-GTIN second (plain `<option>`s or
  `<optgroup>`s, your call on this codebase's existing `<select>` styling):
  ```
  SGTIN-96 (default)
  SGTIN-198
  DS-SGTIN+ (TDS 2.0)
  DS-SGTIN++ (TDS 2.0, custom domain)
  ── or an optgroup break ──
  SSCC-96 (logistic units)
  GRAI-96 (returnable assets)
  GIAI-96 (individual assets)
  GID-96 (general identifier)
  ```
  Update the existing help-text `<span>` below the select to branch per
  standard (8 short one-liners — reuse the descriptions from `CLAUDE-CONCEPT.md`
  §7.6/§16.10, condensed).
- **GTIN picker (`<ProductPicker>`)**: currently rendered whenever
  `kind === "NEW" || (kind === "PRESENT" && presentMatchMode === "GTIN_LIST")`
  (the `showGtinPicker` const). Narrow the `NEW` half of that condition to
  only the 4 GTIN-based standards.
- **Non-GTIN field group**, shown when `kind === "NEW"` and `gs1Standard` is
  one of the 4 non-GTIN standards — a `field-row`/`field-block` matching this
  form's existing visual pattern:
  - `sscc-96`: "Company prefix" (text, hint "6-12 digits") + "Extension
    digit" (text, maxLength 1, default `"0"`).
  - `grai-96`: "Company prefix" + "Asset type" (text).
  - `giai-96`: "Company prefix" + "Individual asset reference" (text).
  - `gid-96`: "General manager number" + "Object class" (text) — no company
    prefix field at all for this one.
- **`gs1Filter`** — a small number input (0-7) shown for every `NEW`
  standard, below the identifier-format select. On `gs1Standard` change, if
  the filter field hasn't been touched by the user yet this session (track
  with a simple "was it manually edited" boolean, or just re-default
  whenever `gs1Standard` changes and accept that a manual edit followed by a
  standard change re-defaults it too — simplicity over perfection here, your
  call), set it to the recommended default (Task 2's table). Show a one-line
  note with the recommended value and, for `gid-96` specifically, that it's
  unconfirmed for this standard.
- **DSGTIN block**, shown only when `gs1Standard` is `dsgtin-plus` or
  `dsgtin-plus-plus`:
  - Date-type toggle (reuse the `icon-toggle` pattern from `PRESENT`'s match
    mode) — "Expiration date" / "Best-before date" → `gs1DateField`.
  - Shelf-life period — a number input + a `<select>` of `days`/`weeks`/`months`,
    stored client-side as its own local state pair and converted to
    `gs1ShelfLifeDays` on save (`days` ×1, `weeks` ×7, `months` ×30 — document
    the approximation inline as a code comment, same as this codebase's other
    documented simplifications). On load from an existing feed, the reverse
    conversion has no clean inverse (days doesn't cleanly map back to a
    unit) — simplest correct behavior: always show the loaded value in
    `days` with the unit reset to `"days"`, not attempt to guess back a
    "weeks" or "months" selection. Note this below the input: "the actual
    date is computed fresh every time this feed fires (today + this period),
    never fixed when you save."
  - Lot code — a toggle "Auto-generate" / "Fixed" → `gs1LotMode`. `"AUTO"`
    (default): a note explaining the `L<YYMMDD>-<XXX>` convention and that
    it's freshly generated every firing, no input shown. `"FIXED"`: a text
    input (`gs1LotCode`, maxLength 20) + a "Suggest" button that fills it
    with one generated code (client-side copy of the Task 3 algorithm — see
    that task's note) — the field stays editable afterward.
  - Custom domain name — a text input, shown **only** when
    `gs1Standard === "dsgtin-plus-plus"`, labeled required, with a short note
    on what it's for. Clear its local state when switching away from
    `dsgtin-plus-plus` so a stale value can't ride along into a `dsgtin-plus`
    save (belt-and-suspenders alongside Task 2's server-side clearing).
- **`handleSave`**'s body-building `if (kind === "NEW") { ... }` block grows
  to include whichever of the new fields are relevant to the resolved
  `gs1Standard` — mirror the same "only send what applies" discipline
  already used for `PRESENT`'s conditional `quantityMax`.
- **The `useEffect` that seeds local state from `feed` on open/edit** needs
  every new field added, with sensible defaults for a brand-new feed
  (`gs1Filter` defaulted via the same per-standard table the moment a
  standard is first picked; `gs1LotMode` defaults `"AUTO"`; `gs1DateField`
  defaults `"expirationDate"`).

## Task 6 — Live-verify before shipping

Do this **early**, before finishing the UI, so a real platform gap is caught
before building UI around it rather than after:

- `POST /gs1/gid-96/generate` with `quantity: 1` — confirm it actually
  returns `200` with a real hex EPC rather than `404 STANDARD_NOT_FOUND`
  (flagged in the spec-vs-live inconsistency note, §7.6). If it 404s, **stop
  and report that back** rather than shipping a GID-96 option that can never
  succeed — don't silently drop it from the UI either, ask first.
- One real `sscc-96`, `grai-96`, and `giai-96` mint at `quantity: 1` each,
  confirming the request-body shapes in Task 3 are accepted (422
  `MISSING_REQUIRED_FIELD`/`UNSUPPORTED_FIELD_FOR_STANDARD` would mean a
  field name or shape is wrong against the real platform, not just the spec
  text).
- One real `dsgtin-plus` mint with a `context.expirationDate` and a lot
  code, and one real `dsgtin-plus-plus` mint with `customDomainName` set —
  confirm both `200`, and that the echoed `context` in the response matches
  what was sent (sanity-checks the date/lot computation independently of
  the platform's own encoding).
- Confirm `filter` is genuinely being read by the platform for at least one
  standard (e.g. compare a `sscc-96` mint at `filter: 0` vs `filter: 1` if
  there's any visible difference in the response — if the API just accepts
  either silently, that's fine too, just note in `CLAUDE-CONCEPT.md` §7.6
  whether anything observable actually changed).
- All of this is a **real, permanent write** to the live tenant — same
  posture as every other Serialization API call in this app. Use
  `quantity: 1` for every check, on the sandbox tenant, never in bulk.

Record what you found (pass/fail per standard, and gid-96's real answer) as
a dated update appended to §7.6/§13 when you check off BL-089 in
`BACKLOG.md` — this is exactly the kind of "spec said X, live said Y" finding
this project's docs have consistently captured (see e.g. the BL-070 zone-code
finding, the `apikey`-vs-`x-api-key` correction).

## Docs

`CLAUDE-CONCEPT.md` §7.6/§16.1/§16.10 and `BACKLOG.md`'s "GS1 standard
expansion" section are already written — update `BL-089` to `[x]` with a
completion note once built (what got built, any deviation from this prompt,
the Task 6 live-verify results per standard — especially `gid-96`'s real
answer).

## Versioning

New feature, no letter suffix → `npm version minor --no-git-tag-version`.

## Verification

- `npx tsc --noEmit` at minimum, a real `npm run build` if it runs clean.
- Task 6's live-verify checks above, all at `quantity: 1`.
- Round-trip each of the 8 standards through the Item Feed form: create,
  save, reload the edit modal, confirm every field came back correctly
  (including `gs1Filter`'s per-standard default, the DSGTIN date/lot
  toggles, and that switching a feed from `dsgtin-plus-plus` to
  `dsgtin-plus` and back doesn't leave a stale `gs1CustomDomainName`).
- Fire a real Workflow with a `dsgtin-plus` Feed Link twice, a day apart if
  practical (or by temporarily adjusting the server clock / mocking `Date`
  in a quick script if not) — confirm the minted item's date genuinely
  reflects "that day + the configured period," not a value frozen at save
  time. If a two-day live test isn't practical, at minimum unit-test
  `computeGs1Date`/`generateLotCode` directly.
- Confirm the existing `sgtin-96`/`sgtin-198` path is untouched — an
  existing Feed on either of those standards should mint exactly as it did
  before this change, byte for byte in the request body.
