# Claude Code prompt — BL-073: migrate `NEW` Item Feed minting to `serialization-api-v3`

## Task:

Luc confirmed **2026-09-01** that `serialization-api-v3-updated (3).yaml` (already in the project's doc list, previously flagged "not yet available" — `CLAUDE-CONCEPT.md` §7.6/§7.7) is now live for five standards: `sgtin-96`, `sgtin-198`, `grai-96`, `sscc-96`, `giai-96`. He gave a working example call:

```
curl --location 'https://api.sandbox.bartender-tt.com/serialization/gs1/sgtin-96/generate' \
  --header 'Accept-Version: v2' \
  --header 'Content-Type: application/json' \
  --header 'apikey: XCONEBOUVGDPDIOD' \
  --data '{
    "quantity": 3,
    "formats": ["hex", "epcUrn", "epcTagUri"],
    "serialSource": { "mode": "internal" },
    "input": { "gtin": "03663328010020", "companyPrefixLength": 7 },
    "ilmd": [{ "lotNumber": "LT001-1234567" }]
  }'
```

**Note the auth header**: it's the bare lowercase `apikey` header — **not** `x-api-key` as the spec text itself says ("All endpoints require an API key in the `x-api-key` header"). Trust Luc's live curl over the spec text — this is the exact same kind of spec-vs-reality correction already on record for `location-api-v2` (§7.3), `inventory-public-api` (§7.8), and `datacollector-api-v3`: all four Bartender APIs this app calls turned out to use the bare `apikey` header regardless of what their own spec text claims. Treat that as confirmed, not something to re-verify.

**Scope, decided with Luc**: migrate the existing `NEW` Item Feed minting path from the legacy `serialization-api` (`GET .../hexas/sgtin96/gtin/{gtin}`, HTTP Basic auth, §7.6) to this new v3 endpoint for **`sgtin-96`** (drop-in — same identity scheme this app already uses everywhere downstream), and add **`sgtin-198`** as an optional per-feed alternate encoding. **`grai-96`, `sscc-96`, `giai-96` are explicitly out of scope for this prompt** — they identify different business objects (returnable assets, logistics units/pallets, individual assets) than the GTIN-based product model `ItemFeed` uses today, and taking them on needs a real data-model conversation with Luc first (new input fields per standard, possibly a new Item Feed kind). Log a note for that rather than guessing at it.

### Known gap to flag, not block on: `companyPrefixLength`

The new endpoint requires `companyPrefixLength` alongside `gtin` (it's how the API splits the GTIN into GS1 company prefix + item reference). This app has **no live source for a real per-GTIN value today** — `master-data-api`, the spec that models this field on its `Product` schema, is still "not yet available" per §7.7, and the legacy `product-api` this app does call doesn't expose it either. Luc's own example hardcodes `7` (the most common GS1 prefix length). Use a documented constant default of **7** for now (see Phase 1 below) rather than blocking on this — flag it clearly in code and in the doc update as a known simplification to revisit once `master-data-api` (or a `product-api` field we haven't seen yet) can supply a real per-product value.

### Not modeled: `ilmd`/lot code

Luc's example includes an optional `ilmd: [{ lotNumber: "..." }]` block. This app has no lot-code concept anywhere in the `ItemFeed`/serialization flow today. Don't add one speculatively — omit `ilmd` from the request entirely for this prompt. Worth a one-line note in the doc update that it exists and isn't wired in, same pattern as other "not yet modeled" fields already on record in §7.6-7.8.

### Phase 1 — `lib/bartenderSerialization.ts`: replace the legacy client

Replace the Basic-Auth `mintForOneGtin` with a v3 client, following the exact gateway pattern already established in `lib/bartenderDataCollector.ts`/`lib/bartenderInventory.ts` (`resolveGatewayUrl` from `lib/bartenderLocations.ts` + a path suffix):

```typescript
import { resolveGatewayUrl } from "@/lib/bartenderLocations";

export function resolveSerializationGatewayUrl(tenantUrl: string): string {
  return `${resolveGatewayUrl(tenantUrl)}/serialization`;
}

// GS1 standards this app currently supports minting — grai-96/sscc-96/giai-96
// are live on the platform (per Luc, 2026-09-01) but not GTIN-based, so they
// don't fit ItemFeed's product-list model yet; see BL-073's follow-up note.
export type Gs1Standard = "sgtin-96" | "sgtin-198";

// No live source for a real per-product GS1 company prefix length yet —
// master-data-api (§7.7) would carry this on its Product schema but isn't
// available; the legacy product-api this app does call doesn't expose it
// either. 7 is the most common real-world GCP length and is what Luc's own
// working example hardcodes. Revisit once a real per-GTIN value exists.
const DEFAULT_COMPANY_PREFIX_LENGTH = 7;

interface Gs1GeneratedSerial {
  serialNumber: string;
  hex?: string;
  epcUrn?: string;
  epcTagUri?: string;
}

// POST {gateway}/serialization/gs1/{standard}/generate — apikey header (see
// note above re: the spec text's x-api-key claim being wrong), Accept-Version
// v2. Requests `hex` only — that's the only format this app currently stores
// or pushes to the platform (POST /reads' `hexa` field, §7.5/BL-063).
async function generateGs1(
  tenantUrl: string,
  apiKey: string,
  standard: Gs1Standard,
  gtin: string,
  quantity: number
): Promise<string[]> {
  const url = `${resolveSerializationGatewayUrl(tenantUrl)}/gs1/${standard}/generate`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { apikey: apiKey, "Accept-Version": "v2", "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity,
        formats: ["hex"],
        serialSource: { mode: "internal" },
        input: { gtin, companyPrefixLength: DEFAULT_COMPANY_PREFIX_LENGTH },
      }),
      cache: "no-store",
    });
  } catch {
    throw new SerializationError("Could not reach the Serialization API — check the tenant URL.");
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    let message = `The Serialization API returned HTTP ${res.status}.`;
    try {
      const body = JSON.parse(raw);
      if (body?.message) message = String(body.message);
    } catch {
      /* keep the generic message */
    }
    throw new SerializationError(message);
  }

  try {
    const body = JSON.parse(raw) as { serials?: Gs1GeneratedSerial[] };
    return (body.serials ?? []).map((s) => s.hex).filter((h): h is string => typeof h === "string");
  } catch {
    throw new SerializationError("Unexpected response from the Serialization API.");
  }
}
```

Update `mintSerializedItems` to take `apiKey` instead of `username`/`password`, and an optional `standard` (default `"sgtin-96"`, preserving today's behavior for every existing feed):

```typescript
export async function mintSerializedItems(
  tenantUrl: string,
  apiKey: string,
  gtins: string[],
  quantity: number,
  standard: Gs1Standard = "sgtin-96"
): Promise<{ gtin: string; epc: string }[]> {
  // ...unchanged cap/grouping logic above this point...
  const out: { gtin: string; epc: string }[] = [];
  for (const [gtin, count] of perGtin) {
    const epcs = await generateGs1(tenantUrl, apiKey, standard, gtin, count);
    for (const epc of epcs) out.push({ gtin, epc });
  }
  return out;
}
```

Keep `MAX_NEW_ITEMS_PER_FIRING`, `cappedQuantity`, `SerializationError`, and the per-GTIN grouping/capping logic exactly as they are today — none of that changes, only how each group actually gets minted.

Update the file's header comment: this is no longer the "legacy" client (that name now belongs to whatever, if anything, still needs describing as legacy — see the doc update in Phase 4) — it's the real v3 client, still carrying the same "every call is a REAL, PERMANENT write" warning verbatim, since that hasn't changed.

### Phase 2 — `lib/workflowRun.ts`: use the API key, thread the standard through

In `resolveBatch`'s `NEW` branch:

```typescript
const minted = await mintSerializedItems(creds.tenantUrl, creds.apiKey, gtins, quantity, feed.gs1Standard || "sgtin-96");
```

`creds` (from `getServiceCredentials()`) already carries `apiKey` — **do not touch `getServiceCredentials()` or its Basic-Auth (`username`/`password`) requirement**: those fields are still genuinely required elsewhere (the legacy Product API client, §7.7, called from `app/api/products/route.ts`/`app/api/categories/route.ts`; and the floor-map fallback, §7.4) — this migration only changes which credential the *minting* call itself uses, not what the app collects or requires in Settings.

### Phase 3 — `ItemFeed` schema + form: optional SGTIN-198

Add to the `ItemFeed` model in `prisma/schema.prisma`, next to the existing `gtins`/`categoryCode` fields:

```prisma
  // NEW only. "sgtin-96" (default, omit/null = same) or "sgtin-198" — which
  // GS1 EPC encoding to mint with (BL-073, 2026-09-0X). grai-96/sscc-96/
  // giai-96 are also live on the platform but aren't GTIN-based and don't
  // fit this field — see BL-073's follow-up note.
  gs1Standard String?
```

Run `npx prisma migrate dev --name add_item_feed_gs1_standard`.

In `components/ItemFeedForm.tsx`, in the `NEW`-kind section (near the existing quantity min/max fields), add a simple selector:

```tsx
<div className="field-block">
  <label htmlFor="feedGs1Standard">Identifier format</label>
  <select
    id="feedGs1Standard"
    value={gs1Standard}
    onChange={(e) => setGs1Standard(e.target.value)}
  >
    <option value="sgtin-96">SGTIN-96 (default)</option>
    <option value="sgtin-198">SGTIN-198</option>
  </select>
</div>
```

with the matching `useState("sgtin-96")`, restore-on-edit (`feed?.gs1Standard || "sgtin-96"`), and save-payload line (`body.gs1Standard = gs1Standard;`), following exactly the same pattern as the existing `zoneCode`/`presentMatchMode` fields in that same form. Only render this field when `kind === "NEW"`.

### Phase 4 — live check before calling this done

This app has never sent a real SGTIN-198 read to the platform — only SGTIN-96 hex (24 hex chars / 96 bits) has ever gone into `POST /datacollector/reads`' `hexa` field (§7.5/BL-063). SGTIN-198 is a different, longer EPC memory-bank encoding (variable length, per the spec). **Before marking this done, mint one real SGTIN-198 item (`quantity: 1`, a real GTIN from Luc's sandbox tenant) and push one real read for it through the existing `sendReads` path** (e.g. trigger a firing on a test `NEW` feed set to `sgtin-198`), and confirm the platform's `POST /reads` actually accepts that longer `hexa` value rather than rejecting it as malformed. If it's rejected, that's useful, expected-shaped information — write it into the `CLAUDE-CONCEPT.md` update (Phase 5) as a known limitation ("SGTIN-198 mints correctly but can't be pushed as a real read — `hexa` expects 96-bit only") rather than treating it as a bug to chase down further; the SGTIN-96 path stays fully working either way.

### Phase 5 — docs

- `CLAUDE-CONCEPT.md` §7.6: mark the legacy `serialization-api` section superseded (mirror how §7.4's superseded note or §15.8's are written — struck-through framing, not deleted, since the legacy endpoint/module may still be referenced in old decision-log entries). Add a new subsection (or extend 7.6 in place) documenting the v3 client: gateway pattern, the `apikey`-not-`x-api-key` correction, the `companyPrefixLength=7` default and why, the `ilmd` gap, and the SGTIN-198-push-verification result from Phase 4.
- `CLAUDE-CONCEPT.md` §13: new dated decision-log entry recording the migration, the two standards actually built (sgtin-96 migrated, sgtin-198 added), and grai-96/sscc-96/giai-96 explicitly deferred pending Luc's input on how Item Feed should model non-GTIN identifiers.
- `BACKLOG.md`: new **BL-073** entry (checked off on completion) — SGTIN-96 migration + SGTIN-198 option — plus a short new unchecked note/item flagging GRAI-96/SSCC-96/GIAI-96 as open, waiting on Luc's data-model call, so it doesn't get lost.

### Verify

- An existing `NEW` feed (no `gs1Standard` set, i.e. `null`) still fires and mints exactly as before — same downstream `epc`/`hexa` behavior, defaulted to `sgtin-96`.
- A feed explicitly set to `sgtin-198` mints and the resulting hex makes it into `SimulatedRead.items` the same way SGTIN-96 items do today.
- Phase 4's live SGTIN-198-push check actually ran, and its outcome (accepted or rejected by `POST /reads`) is recorded in the doc update either way.
- `MAX_NEW_ITEMS_PER_FIRING` cap still enforced — a request for more than 10 across however many GTINs still clamps, same as today.
- Existing E2E suite still green.
- The legacy Basic-Auth Serialization credential path isn't broken for anything else (Settings still saves/loads username+password fine — they're just unused by minting now, still used by Product API + floor-map).

### Conventions

- Branch `staging`.
- New backlog item, no letter suffix → `npm version minor --no-git-tag-version`, same commit as the fix.
- Check off `BACKLOG.md` BL-073 with a short completion note including the Phase 4 SGTIN-198 push-verification result.
