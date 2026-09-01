# Claude Code prompt — BL-070: fix the `PRESENT` / "In stock" Item Feed zone-code mismatch

## Task:

`BACKLOG.md` **BL-070** has been **BLOCKED, waiting on Luc** since 2026-08-31. Luc has now reviewed the coverage-audit note added to `CLAUDE-CONCEPT.md` §7.3 on 2026-09-01 and given the go-ahead to attempt the fix — **this prompt is that go-ahead.** But the fix rests on a hypothesis that has never been checked against live data, so **treat verification as a real gate, not a formality**: if Phase 0 doesn't confirm it, stop there and report back rather than pushing on.

- Recap of the bug (§7.8, §13 decision log, `BACKLOG.md` line 144): the Item Feed form's zone picker is populated from `location-api-v2`'s `GET /locations/{code}/zones`, which this app currently exposes only as a human-facing `code`/`name` (e.g. `14527.2549.…` / `MINILOAD`). `GET /inventory/stock` (from `inventory-public-api`) keys its rows by a completely different-looking code (e.g. `DEMOTT.00005.…`). A `PRESENT` feed's saved `zoneCode` is the picker's value, so `lib/bartenderInventory.ts`'s `getStock()` client-side filter (`results.filter((r) => r.zoneCode === query.zoneCode)`) never matches anything, `available` is always `0`, and the feed never fires.
- The hypothesis (mine, not yet verified — see `CLAUDE-CONCEPT.md` §7.3's 2026-09-01 audit note): the `DEMOTT.00005.…`-shaped values are a Zone's **`bizLocation`** (an EPCIS SGLN-style id), which `location-api-v2`'s `Zone` schema exposes as its own field but which this app's `RawZone`/`LocationZone` types (`lib/bartenderLocations.ts`) never capture. `inventory-public-api`'s own docs describe its data model as "structured around Site (`bizLocation`), Zone (`bizLocation` sub-unit)" — consistent with `GET /stock` keying its `zoneCode` field by `bizLocation` rather than by the Zone's plain `code`.
- **Phase 0 below exists to confirm or kill that hypothesis with one live comparison before any code changes.** If it's confirmed, proceed through the rest of the phases. **If it is NOT confirmed — the values still don't line up, or `bizLocation` is missing/null on the zones you check — stop immediately.** Do not fall back to trying the "internal APIs" (`statemachine-api-configuration`) on your own initiative — that was Luc's alternate idea, not a decision, and picking it silently would be exactly the kind of undocumented product call `CLAUDE.md` says to avoid. Instead, write up exactly what Phase 0 found (raw values, both sides) as a new dated note under `CLAUDE-CONCEPT.md` §13, leave `BACKLOG.md` BL-070 blocked with that note referenced, and report back in the chat — Luc will take it from there.
- **Out of scope regardless of outcome**: the separate, already-documented limitation that `GET /stock` returns counts, not individual EPCs, so even a correctly-matched zone still produces placeholder ids that `sendReads` rejects with `400 VALIDATION_ERROR` (§7.8, "Separately — even with a matching zone..."). This fix only targets getting `available > 0` so the batch stops being empty; it does not and cannot make real platform pushes for `PRESENT` succeed. Don't touch that path.

### Phase 0 — mandatory live verification (do this first, before writing any fix code)

Write a small one-off script, `scripts/verify-bl070-zone-match.ts`, following this project's existing `tsx` script convention (see `scripts/bugs-export.ts` for the pattern — plain `async function main()`, `main().catch(...)`). It should:

1. Take a user's email as a CLI arg (default to `lbellissard@seagullsoftware.com`, the seeded admin account most likely to have a working Bartender connection — confirm via `getUserBartenderCredentials`/whatever this app's Settings-tab helper is; fail loudly with a clear message if that user has no stored connection rather than crashing on a null).
2. Call `listLocations(tenantUrl, apiKey)` (`lib/bartenderLocations.ts`) and print the site codes/names so you can pick one — or take a `--location` CLI arg if you already know one from an earlier session (the decision-log mentions a `MEMBPR001-STORED PARTS` feed that was traced live on 2026-08-31; if a Site/Location code from that trace is discoverable in seed data or an existing `ItemFeed` row, prefer it, but don't block on finding it — any site with zones works).
3. For the chosen location, fetch zones via a **raw** call to `GET {gateway}/locations/{code}/zones` (reuse `resolveGatewayUrl` from `lib/bartenderLocations.ts`, same `apikey` header) rather than going through `getLocationZones` — you need the **full raw JSON**, including `bizLocation` and `sgln`, which the existing `RawZone`/`getLocationZones` mapping currently drops. Print each zone's `code`, `zoneCode` (if present), `bizLocation`, and `sgln`.
4. Call `getStock(tenantUrl, apiKey, { groupBy: "zone", locationCode: <that location's code>, pids: undefined })` (`lib/bartenderInventory.ts`) **unfiltered by zone** (leave `zoneCode` unset, since the server ignores it anyway per the existing comment) and print each result row's `zoneCode`/`zoneName`/`qty`.
5. Compare: for each zone from step 3, does its `bizLocation` value equal (or obviously correspond to — check for prefix/suffix differences too, not just exact string equality) any `zoneCode` value returned in step 4? Print a clear PASS/FAIL-style summary line per zone.

Run it (`npx tsx scripts/verify-bl070-zone-match.ts`), read the actual output, and only proceed to Phase 1 if at least one zone shows a real match. If the match is exact-but-differently-cased, or matches after stripping a prefix, that's still a confirmed pattern — just document the exact transform needed in the code comment in Phase 1. If nothing lines up at all, stop per the framing above.

Leave the script in `scripts/` afterward (delete it only if Phase 0 fails and you're not proceeding — otherwise it's a reasonable diagnostic to keep, similar in spirit to the `bugs-*` scripts, but it's not part of the `package.json` `scripts` block since it's one-off, not a recurring op).

### Phase 1 — capture `bizLocation` through the Location API layer

In `lib/bartenderLocations.ts`:

```typescript
interface RawZone {
  zoneCode?: string;
  zoneName?: string;
  type?: string | null;
  position: { x: number; y: number };
  bizLocation?: string | null; // add
  sgln?: string | null;        // add — cheap to carry, unused for now
}

export interface LocationZone {
  code?: string;
  name?: string;
  type?: string;
  position: { x: number; y: number };
  bizLocation?: string; // add — the value GET /stock actually keys zoneCode by, per BL-070
}
```

Update `getLocationZones`'s mapping to pass `bizLocation: z.bizLocation ?? undefined` through. Apply whatever transform Phase 0 found necessary (exact copy, or a documented prefix strip) — comment the "why" inline, referencing this BL-070 fix and the Phase 0 finding, not just "converts the value."

### Phase 2 — carry it through the zone-picker API route and form

`app/api/locations/[code]/zones/route.ts` needs **no changes** — it already does `NextResponse.json({ zones: result.data })` with no field-narrowing, so `bizLocation` passes through automatically once Phase 1 adds it to `LocationZone`.

In `components/ItemFeedForm.tsx`:
- Extend `ZoneOption` to include `bizLocation?: string`.
- In the zone-fetch effect (`fetch(/api/locations/${locationCode}/zones)...`), carry `bizLocation` through into the mapped `ZoneOption[]`.
- Add a new piece of state, e.g. `zoneBizLocation`, set alongside `zoneCode` whenever the zone `<select>` changes (`onChange`) — look up the matching `ZoneOption` from `zones` by the selected `code` and pull its `bizLocation`. Also restore it from `feed?.zoneBizLocation` on edit, same as the existing `setZoneCode(feed?.zoneCode ?? "")` line.
- In the save payload (near the existing `body.zoneCode = zoneCode;`), also set `body.zoneBizLocation = zoneBizLocation || undefined;`.

### Phase 3 — new `ItemFeed` field + migration

Add to the `ItemFeed` model in `prisma/schema.prisma`, right next to the existing `zoneCode`:

```prisma
  // The Zone's bizLocation (EPCIS SGLN-style id) — what GET /inventory/stock
  // actually keys its zoneCode field by (BL-070 fix, 2026-09-0X). zoneCode
  // above stays the human-facing value shown in the picker/UI; this is the
  // value resolveBatch() sends to getStock(). Nullable so pre-fix feeds keep
  // working (fall back to zoneCode) until re-saved.
  zoneBizLocation String?
```

Run `npx prisma migrate dev --name add_item_feed_zone_bizlocation`.

### Phase 4 — use it in the run engine

In `lib/workflowRun.ts`'s `resolveBatch()`, in the `PRESENT` branch, change the `getStock` call to prefer the new field with a fallback:

```typescript
  const stock = await getStock(creds.tenantUrl, creds.apiKey, {
    groupBy: "zone",
    locationCode: feed.locationCode ?? undefined,
    zoneCode: feed.zoneBizLocation ?? feed.zoneCode ?? undefined,
    pids: useAll ? undefined : gtins,
  });
```

(`feed` is loosely typed `any` here already, per the existing `eslint-disable` comments — no type-plumbing needed beyond the Prisma field existing.)

Leave the placeholder-id line (`present:${feed.zoneCode ?? "zone"}:...`) as-is — it's just a debug-friendly id prefix, not part of the actual filter logic, and the out-of-scope counts-vs-EPCs limitation means these ids are never sent for real regardless.

### Phase 5 — existing feeds

Any `PRESENT` feed saved before this fix has `zoneCode` set but `zoneBizLocation` null, so the fallback keeps it exactly as broken as before (not worse) until re-saved. Check how many `PRESENT` feeds exist in the seed/dev data (`SELECT count(*) FROM "ItemFeed" WHERE kind = 'PRESENT'` or the Prisma equivalent) — if it's a small number (single digits, plausible given this is still pre-launch), the simplest fix is to just note in `BACKLOG.md`'s completion note that Luc should re-open and re-save each affected feed's zone in the UI to pick up `bizLocation` (the `<select>` already forces a fresh fetch, so simply re-selecting the same zone in the dropdown populates the new field). Don't write a backfill script for this unless the count turns out to be large enough that manual re-saving is genuinely impractical — flag your judgment call and the actual count in the completion note either way.

### Verify

- Phase 0's script output actually shows a confirmed match (paste the key lines into your completion note/commit message, not just "verified" — the point is Luc can see the real values).
- After the fix, re-run (or manually trigger) a `PRESENT` feed's Task tick against the same zone Phase 0 checked and confirm `available > 0` / a non-empty batch — a log line or a quick DB check on the resulting `SimulatedRead.items` length is enough, doesn't need a full E2E test.
- Existing E2E suite still green (`npm run test:e2e` or whatever this repo's existing command is — check `package.json`).
- Saving an Item Feed with a `PRESENT` kind still round-trips `zoneCode` and the new `zoneBizLocation` correctly through create and edit.

### Conventions

- Branch `staging`.
- This is a bug fix (BL-070 already exists, no letter suffix, existing item) → `npm version patch --no-git-tag-version`, same commit as the fix.
- Check off `BACKLOG.md` BL-070 (`- [x]`) with a short completion note **only if Phase 0 confirmed the hypothesis and you completed the fix** — if Phase 0 failed, leave it unchecked with a note instead, per the framing above.
- Add a dated entry to `CLAUDE-CONCEPT.md` §13 either way (confirmed-and-fixed, or confirmed-hypothesis-false-here's-what-we-found) — this is exactly the kind of finding that section exists to capture.
