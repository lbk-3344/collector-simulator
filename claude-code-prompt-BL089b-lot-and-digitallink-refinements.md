# Claude Code prompt — BL-089b: Digital Link base URL for `dsgtin-plus`; lot-code randomize toggle + granularity

## Context

BL-089 (all 8 GS1 standards for `NEW` Item Feeds) shipped 2026-09-17, v0.37.0 — see
`CLAUDE-CONCEPT.md` §7.6 / §16.10's "Built" notes and `BACKLOG.md`'s BL-089 entry for
the full history. This prompt is a small follow-up (**BL-089b**) from Luc actually
using the shipped feature, two independent refinements:

1. `gs1DigitalLinkBaseUrl` should be adjustable for `dsgtin-plus` too, not just
   `dsgtin-plus-plus` as originally specced.
2. Lot-code auto-generation (`gs1LotMode = "AUTO"`) should let the user turn the
   random 3-character suffix off, and pick how often the deterministic part of the
   code changes — once per day or once per half-day — to replicate a real-world
   pattern where the same lot number is reused across many firings.

Full design writeup: `CLAUDE-CONCEPT.md` §16.10's "Follow-up, 2026-09-17 (BL-089b)"
paragraph (read that first) and `BACKLOG.md`'s BL-089b item. Everything below is
concrete implementation guidance against the actual code as it exists right after
BL-089's build commit — line numbers/snippets are what's there now; re-check them if
anything's shifted since.

## Task 1 — `prisma/schema.prisma`: two new nullable `ItemFeed` columns

Add, right after the existing `gs1DigitalLinkBaseUrl String?` line in the `ItemFeed`
model (in the DSGTIN comment block):

```prisma
// BL-089b (2026-09-17) — DSGTIN AUTO lot mode only. gs1LotRandomize defaults to
// true when unset (preserves BL-089's exact original behavior: a fresh random
// 3-char suffix every firing). gs1LotGranularity ("DAY" | "HALF_DAY") only
// matters when gs1LotRandomize is false — it picks how often the deterministic
// part of the code changes. Luc: "many times, the lot number will be the same
// for the whole day, or for a half day."
gs1LotRandomize    Boolean?
gs1LotGranularity  String? // "DAY" (default) | "HALF_DAY" — half-day splits at server-clock noon
```

Run `npx prisma migrate dev --name bl089b_lot_randomize_granularity`.

## Task 2 — `lib/itemFeed.ts`: thread the two new fields through validation

`ItemFeedRecord` (around line 90-105): add `gs1LotRandomize: boolean | null;` and
`gs1LotGranularity: string | null;` next to the existing `gs1LotCode`/`gs1LotMode`
lines.

`buildItemFeedData` (around line 150-160 for the `let` declarations, line 217-224 for
the `gs1LotMode` branch, line 281-290 for the returned object):

- Add `let gs1LotRandomize: boolean | null = null;` and
  `let gs1LotGranularity: string | null = null;` alongside the other DSGTIN `let`s.
- Inside the existing `gs1LotMode = ["NONE", "AUTO", "FIXED"].includes(...) ? ... : "AUTO"`
  branch, add a nested case for `AUTO`:

  ```ts
  if (gs1LotMode === "FIXED") {
    gs1LotCode = str(body.gs1LotCode);
    if (!gs1LotCode || gs1LotCode.length > 20) {
      return { error: "A fixed lot code is required (1-20 characters) when lot mode is Fixed." };
    }
  } else {
    gs1LotCode = null; // AUTO generates fresh at fire time; NONE sends no lotCode at all
  }
  if (gs1LotMode === "AUTO") {
    gs1LotRandomize = body.gs1LotRandomize === false ? false : true; // default true — unchanged behavior
    gs1LotGranularity = body.gs1LotGranularity === "HALF_DAY" ? "HALF_DAY" : "DAY";
  } else {
    gs1LotRandomize = null;
    gs1LotGranularity = null;
  }
  ```

- Add both to the returned object alongside `gs1LotMode`/`gs1LotCode`.

## Task 3 — `lib/itemFeed.ts`: widen the `dsgtin-plus-plus`-only gate to both DSGTIN standards

Line ~226-233 currently reads:

```ts
if (gs1Standard === "dsgtin-plus-plus") {
  gs1DigitalLinkBaseUrl = str(body.gs1DigitalLinkBaseUrl) ?? "https://id.gs1.org";
  if (!/^https:\/\//.test(gs1DigitalLinkBaseUrl)) {
    return { error: "The Digital Link base URL must start with https://." };
  }
} else {
  gs1DigitalLinkBaseUrl = null; // dsgtin-plus doesn't embed a domain — never carried over
}
```

This whole block is already inside `if (isDsgtinStandard(gs1Standard)) { ... }` (line
207), so simply drop the inner `gs1Standard === "dsgtin-plus-plus"` check — every
DSGTIN standard now gets the field:

```ts
gs1DigitalLinkBaseUrl = str(body.gs1DigitalLinkBaseUrl) ?? "https://id.gs1.org";
if (!/^https:\/\//.test(gs1DigitalLinkBaseUrl)) {
  return { error: "The Digital Link base URL must start with https://." };
}
```

(There's no longer an `else` branch clearing it to `null` for `dsgtin-plus` — both
standards now default/validate the same way. `gs1DigitalLinkBaseUrl` stays `null` for
every non-DSGTIN standard because this whole block only runs inside the
`isDsgtinStandard` branch, unchanged.)

## Task 4 — `lib/bartenderSerialization.ts`: `generateLotCode`, `FeedGs1Fields`, `buildFiringContext`, `digitalLinkBaseUrl` gating

**`generateLotCode`** (currently, line ~56-65):

```ts
export function generateLotCode(now: Date = new Date()): string {
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const suffix = Array.from(
    { length: 3 },
    () => LOT_SUFFIX_ALPHABET[Math.floor(Math.random() * LOT_SUFFIX_ALPHABET.length)]
  ).join("");
  return `L${yy}${mm}${dd}-${suffix}`;
}
```

Grow it with an options param, defaulting to today's exact behavior when omitted:

```ts
export interface LotCodeOptions {
  randomize?: boolean; // default true — unchanged behavior
  granularity?: "DAY" | "HALF_DAY"; // default "DAY"; only visibly matters when randomize is false
}

export function generateLotCode(now: Date = new Date(), opts: LotCodeOptions = {}): string {
  const randomize = opts.randomize !== false;
  const granularity = opts.granularity === "HALF_DAY" ? "HALF_DAY" : "DAY";
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  let code = `L${yy}${mm}${dd}`;
  if (granularity === "HALF_DAY") {
    code += now.getHours() < 12 ? "-AM" : "-PM";
  }
  if (randomize) {
    const suffix = Array.from(
      { length: 3 },
      () => LOT_SUFFIX_ALPHABET[Math.floor(Math.random() * LOT_SUFFIX_ALPHABET.length)]
    ).join("");
    code += `-${suffix}`;
  }
  return code;
}
```

Check the four outputs by hand once written: `L250917-K3M` (day+random, default —
must match today's exact output for the default call `generateLotCode(now)` with no
second arg, since existing tests/behavior depend on it), `L250917` (day, no random),
`L250917-AM` (half-day, no random), `L250917-AM-K3M` (half-day+random).

**`FeedGs1Fields`** (line ~205): add `gs1LotRandomize?: boolean | null;` and
`gs1LotGranularity?: string | null;` next to `gs1LotCode`.

**`buildFiringContext`** (line ~217-229): the `gs1LotMode === "AUTO"` branch currently
calls `generateLotCode(now)` with no options — pass the new fields through:

```ts
if (feed.gs1LotMode === "AUTO") {
  context.lotCode = generateLotCode(now, {
    randomize: feed.gs1LotRandomize !== false,
    granularity: feed.gs1LotGranularity === "HALF_DAY" ? "HALF_DAY" : "DAY",
  });
} else if (feed.gs1LotMode === "FIXED" && feed.gs1LotCode) {
  context.lotCode = feed.gs1LotCode;
}
```

**`digitalLinkBaseUrl` gating** in `mintSerializedItems` (line ~301-304, inside the
GTIN-based-standards loop):

```ts
digitalLinkBaseUrl: feed.standard === "dsgtin-plus-plus" ? (feed.gs1DigitalLinkBaseUrl ?? undefined) : undefined,
```

Change to cover both DSGTIN standards:

```ts
digitalLinkBaseUrl: isDsgtin ? (feed.gs1DigitalLinkBaseUrl ?? undefined) : undefined,
```

(`isDsgtin` is already computed a few lines above this, at line ~292 —
`feed.standard === "dsgtin-plus" || feed.standard === "dsgtin-plus-plus"` — reuse it,
don't recompute.)

**`generateGs1`**'s own top-level `digitalLinkBaseUrl` send (line ~155-157):

```ts
if (opts.standard === "dsgtin-plus-plus") {
  body.digitalLinkBaseUrl = opts.digitalLinkBaseUrl || "https://id.gs1.org";
}
```

Widen the same way:

```ts
if (opts.standard === "dsgtin-plus" || opts.standard === "dsgtin-plus-plus") {
  body.digitalLinkBaseUrl = opts.digitalLinkBaseUrl || "https://id.gs1.org";
}
```

(`Gs1MintOptions.digitalLinkBaseUrl`'s comment currently says "dsgtin-plus-plus only
— TOP-LEVEL request field" — update the comment to say "DSGTIN only" while you're
there.)

## Task 5 — `lib/workflowRun.ts` `resolveBatch()`

Check what fields it reads off the `ItemFeed` row and passes into `FeedGs1Fields` when
building the object handed to `mintSerializedItems` — add `gs1LotRandomize` and
`gs1LotGranularity` alongside the existing `gs1LotMode`/`gs1LotCode` pass-through. No
other logic change needed here; this task is purely "don't let the two new columns
get silently dropped on the way from the DB row to the mint call," the exact class of
bug the `duplicate` route hit during BL-089's own build (see Task 6 below for the
same trap).

## Task 6 — `app/api/item-feeds/[id]/duplicate/route.ts`

BL-089's own build note: this route lists copied fields explicitly rather than
spreading, so BL-089's 12 new columns had to be added by hand or Duplicate would
silently drop them on a clone. Same trap here — add `gs1LotRandomize:
source.gs1LotRandomize` and `gs1LotGranularity: source.gs1LotGranularity` next to the
existing `gs1LotMode`/`gs1LotCode` lines (around line 53-57).

## Task 7 — `components/ItemFeedForm.tsx`

**State** (around line 118-124, next to the other DSGTIN `useState`s):

```ts
const [gs1LotRandomize, setGs1LotRandomize] = useState(true);
const [gs1LotGranularity, setGs1LotGranularity] = useState<"DAY" | "HALF_DAY">("DAY");
```

**Load from `feed`** (in the `useEffect` around line 130-162, next to the other
`setGs1LotMode`/`setGs1LotCode` calls):

```ts
setGs1LotRandomize(feed?.gs1LotRandomize !== false);
setGs1LotGranularity((feed?.gs1LotGranularity as "DAY" | "HALF_DAY") ?? "DAY");
```

**`handleStandardChange`** (line ~200): the existing line

```ts
if (next !== "dsgtin-plus-plus") setGs1DigitalLinkBaseUrl("https://id.gs1.org");
```

should now only reset when leaving DSGTIN entirely, not when switching between the
two DSGTIN standards (switching `dsgtin-plus` ↔ `dsgtin-plus-plus` should keep
whatever base URL the user already typed):

```ts
if (!DSGTIN_STANDARDS.has(next)) setGs1DigitalLinkBaseUrl("https://id.gs1.org");
```

**`handleSave`** (line ~246-249): currently

```ts
body.gs1LotMode = gs1LotMode;
if (gs1LotMode === "FIXED") body.gs1LotCode = gs1LotCode;
if (gs1Standard === "dsgtin-plus-plus") body.gs1DigitalLinkBaseUrl = gs1DigitalLinkBaseUrl;
```

becomes:

```ts
body.gs1LotMode = gs1LotMode;
if (gs1LotMode === "FIXED") body.gs1LotCode = gs1LotCode;
if (gs1LotMode === "AUTO") {
  body.gs1LotRandomize = gs1LotRandomize;
  body.gs1LotGranularity = gs1LotGranularity;
}
body.gs1DigitalLinkBaseUrl = gs1DigitalLinkBaseUrl; // both DSGTIN standards now
```

**JSX — Lot code block's "Auto-generate" branch** (currently a single `<p className="note">`
at line ~608-612): replace with the checkbox + conditional granularity select:

```tsx
{gs1LotMode === "AUTO" && (
  <div style={{ marginTop: 6 }}>
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
      <input
        type="checkbox"
        checked={gs1LotRandomize}
        onChange={(e) => setGs1LotRandomize(e.target.checked)}
      />
      Include random suffix
    </label>
    {gs1LotRandomize ? (
      <p className="note" style={{ marginTop: 6 }}>
        A fresh lot code (e.g. L250917-K3M — date + a random suffix) is generated every time this feed fires.
      </p>
    ) : (
      <>
        <div className="field-block" style={{ marginTop: 8 }}>
          <label>Changes</label>
          <select
            value={gs1LotGranularity}
            onChange={(e) => setGs1LotGranularity(e.target.value as "DAY" | "HALF_DAY")}
          >
            <option value="DAY">Once per day</option>
            <option value="HALF_DAY">Once per half-day</option>
          </select>
        </div>
        <p className="note" style={{ marginTop: 6 }}>
          {gs1LotGranularity === "DAY"
            ? "Every firing on the same calendar day sends the same lot code (e.g. L250917)."
            : "The lot code changes once at midday (server clock) — e.g. L250917-AM, then L250917-PM after noon."}
        </p>
      </>
    )}
  </div>
)}
```

**JSX — Digital Link base URL field** (currently gated on
`gs1Standard === "dsgtin-plus-plus"` at line ~631): widen to both DSGTIN standards and
soften the help text, since it's no longer `dsgtin-plus-plus`-exclusive:

```tsx
{isDsgtin && (
  <div className="field-block">
    <label htmlFor="gs1DigitalLinkBaseUrl">Digital Link base URL</label>
    <input
      id="gs1DigitalLinkBaseUrl"
      type="text"
      value={gs1DigitalLinkBaseUrl}
      onChange={(e) => setGs1DigitalLinkBaseUrl(e.target.value)}
    />
    <span className="note" style={{ marginTop: 4 }}>
      {gs1Standard === "dsgtin-plus-plus"
        ? "This standard embeds the domain directly into the identifier."
        : "Used to build this item's resolvable Digital Link."}
    </span>
  </div>
)}
```

(`isDsgtin` is already computed above, line ~189 — reuse it.)

## Task 8 — client-side `generateLotCode` copy (top of the same file, line ~13-19)

This copy backs only the "Suggest" button preview in Fixed mode and is unrelated to
the randomize/granularity toggle (that toggle only applies to `AUTO` mode, where the
server always regenerates fresh at fire time anyway — the client never calls this
copy for `AUTO`). **Leave it as-is** — no change needed here, noting it explicitly so
it isn't accidentally touched or duplicated with options it'll never receive.

## Verification (mirrors BL-089's own Task 6 pattern — live-verify through this
build's real code path, not just types)

- `tsc --noEmit` + `next build` clean.
- Round-trip through the real form + API, for a `dsgtin-plus` feed: set a custom
  Digital Link base URL, save, reload the edit form, confirm the value survived (it
  wasn't being sent/stored for `dsgtin-plus` before this change).
- Fire a `dsgtin-plus-plus` feed twice within the same test with `gs1LotRandomize =
  false`, `gs1LotGranularity = "DAY"` — confirm both firings produce the *same*
  `lotCode` (check via `apiCallLog` or a temporary console.log in `buildFiringContext`
  if there's no easier hook) and that flipping to `"HALF_DAY"` only changes the code
  across the noon boundary, not within the same half-day.
- Confirm the existing default path (`gs1LotRandomize` unset/`true`, `gs1LotGranularity`
  unset/`"DAY"`) still produces a fresh unique `L<YYMMDD>-<XXX>` every firing —
  BL-089's original behavior must be byte-for-byte unchanged when the new fields are
  left untouched.
- `npm version patch --no-git-tag-version` (letter-suffix-free but this is a
  refinement of an already-shipped feature, not a new backlog item in its own
  numeric right — treat as a patch per the bug-fix/variant rule in `CLAUDE.md`) before
  committing.
- Check off BL-089b in `BACKLOG.md` with a completion note, and add a short "Built"
  note to `CLAUDE-CONCEPT.md` §16.10's BL-089b paragraph, same pattern as BL-089's own
  "Built" note.
