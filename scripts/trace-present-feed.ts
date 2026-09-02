import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { resolveGatewayUrl } from "@/lib/bartenderLocations";
import { resolveInventoryGatewayUrl } from "@/lib/bartenderInventory";
import { tagForItem, sendReads } from "@/lib/bartenderDataCollector";

// One-off: trace the exact HTTP calls a PRESENT ("from stock") Item Feed
// firing makes, for a given site + zone. Mirrors lib/workflowRun.ts
// resolveBatch()/emitReadAndScheduleHops() step for step.
//
//   npx tsx scripts/trace-present-feed.ts --location TTMBASE --zone-name MEMBPR02 [--prod] [email]

async function main() {
  const args = process.argv.slice(2);
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const wantLocation = val("--location") ?? "TTMBASE";
  const wantZoneName = val("--zone-name"); // human name, e.g. MEMBPR02
  const wantZoneCode = val("--zone-code"); // or an explicit code
  const useProd = args.includes("--prod");
  const email = args.find((a) => a.includes("@")) ?? "lbellissard@seagullsoftware.com";
  const quantity = Number(val("--qty") ?? 5);
  const matchMode = (val("--match") ?? "ALL").toUpperCase(); // ALL | GTIN_LIST
  const gtins = (val("--gtins") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const dbUrl = useProd ? process.env.DATABASE_URL_PRODUCTION : process.env.DATABASE_URL;
  const prisma = new PrismaClient(useProd ? { datasources: { db: { url: dbUrl } } } : undefined);

  const line = (s = "") => console.log(s);
  const call = async (label: string, url: string) => {
    line(`\n▶ ${label}`);
    line(`  GET ${url}`);
    line(`  headers: { apikey: "…${"" /*redacted*/}" }`);
    const t0 = Date.now();
    const res = await fetch(url, { headers: { apikey: apiKey }, cache: "no-store" });
    const ms = Date.now() - t0;
    const raw = await res.text();
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      /* keep raw */
    }
    line(`  ← HTTP ${res.status} (${ms} ms)`);
    const pretty = body ? JSON.stringify(body, null, 2) : raw;
    line(pretty.split("\n").map((l) => "    " + l).join("\n"));
    return { status: res.status, body, raw };
  };

  let apiKey = "";
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { bartenderTenantUrl: true, bartenderApiKeyCiphertext: true },
    });
    if (!user?.bartenderTenantUrl || !user.bartenderApiKeyCiphertext) {
      console.error(`✗ ${email} has no stored Bartender connection on ${useProd ? "PRODUCTION" : "local"} DB.`);
      process.exit(1);
    }
    const tenantUrl = user.bartenderTenantUrl;
    apiKey = decrypt(user.bartenderApiKeyCiphertext);

    line("═".repeat(72));
    line(`PRESENT / "from stock" feed firing trace`);
    line("═".repeat(72));
    line(`user            : ${email}   (DB: ${useProd ? "PRODUCTION" : "local"})`);
    line(`tenantUrl       : ${tenantUrl}`);
    line(`location gateway: ${resolveGatewayUrl(tenantUrl)}`);
    line(`inventory gateway: ${resolveInventoryGatewayUrl(tenantUrl)}`);
    line(`apiKey (last 4) : …${apiKey.slice(-4)}`);
    line(`feed under test : location=${wantLocation}  zone-name=${wantZoneName ?? "-"}  zone-code=${wantZoneCode ?? "-"}`);
    line(`                  matchMode=${matchMode}  gtins=[${gtins.join(", ")}]  quantity(random up to)=${quantity}`);

    // ── The Item Feed FORM populates its zone picker from this ──────────────
    const zonesUrl = `${resolveGatewayUrl(tenantUrl)}/locations/${encodeURIComponent(wantLocation)}/zones`;
    const zres = await call(
      `location-api-v2 — list zones (only used when AUTHORING the feed, not at firing time)`,
      zonesUrl
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zones: any[] = (zres.body as any)?.zones ?? [];
    const matchingZones = zones.filter(
      (z) =>
        (wantZoneName && (z.zoneName === wantZoneName || z.name === wantZoneName)) ||
        (wantZoneCode && (z.zoneCode === wantZoneCode || z.code === wantZoneCode))
    );
    line(`\n  → zone entries whose name/code matches "${wantZoneName ?? wantZoneCode}":`);
    for (const z of matchingZones) {
      line(`      zoneCode=${JSON.stringify(z.zoneCode ?? z.code)}  zoneName=${JSON.stringify(z.zoneName ?? z.name)}`);
    }
    if (matchingZones.length === 0) line(`      (none — the picker would not offer this zone)`);

    // The feed stores ONE zoneCode. Emulate what the form would save: the
    // zoneCode field of the first matching entry (that's z.code = z.zoneCode
    // in getLocationZones' mapping).
    const savedZoneCode =
      wantZoneCode ?? matchingZones[0]?.zoneCode ?? matchingZones[0]?.code ?? "(unresolved)";
    line(`\n  → the feed row would persist  zoneCode = ${JSON.stringify(savedZoneCode)}`);

    // ── FIRING TIME: lib/workflowRun.ts resolveBatch() for kind PRESENT ────
    line(`\n${"─".repeat(72)}`);
    line(`FIRING — lib/workflowRun.ts › resolveBatch(feed, creds)  [feed.kind === "PRESENT"]`);
    line(`${"─".repeat(72)}`);

    const params = new URLSearchParams();
    params.set("groupBy", "zone");
    params.set("locationCode", wantLocation);
    if (savedZoneCode && savedZoneCode !== "(unresolved)") params.set("zoneCode", savedZoneCode);
    if (matchMode === "GTIN_LIST") for (const g of gtins) params.append("pid", g);
    const stockUrl = `${resolveInventoryGatewayUrl(tenantUrl)}/stock?${params.toString()}`;
    const sres = await call(`inventory-public-api — getStock({ groupBy:"zone", locationCode, zoneCode${matchMode === "GTIN_LIST" ? ", pids" : ""} })`, stockUrl);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let results: any[] = Array.isArray((sres.body as any)?.results) ? (sres.body as any).results : [];
    line(`\n  server returned ${results.length} row(s). Now lib/bartenderInventory.ts filters client-side:`);
    const before = results.length;
    results = results.filter((r) => r.locationCode === wantLocation);
    line(`    after  r.locationCode === "${wantLocation}"   → ${results.length} (was ${before})`);
    if (savedZoneCode && savedZoneCode !== "(unresolved)") {
      const b2 = results.length;
      results = results.filter((r) => r.zoneCode === savedZoneCode);
      line(`    after  r.zoneCode === ${JSON.stringify(savedZoneCode)}   → ${results.length} (was ${b2})`);
    }
    if (matchMode === "GTIN_LIST" && gtins.length) {
      const b3 = results.length;
      results = results.filter((r) => r.pid != null && gtins.includes(r.pid));
      line(`    after  pid ∈ [${gtins.join(", ")}]   → ${results.length} (was ${b3})`);
    }

    const available = results.reduce((sum, r) => sum + (r.qty ?? 0), 0);
    const pull = Math.min(available, quantity);
    line(`\n  available = Σ qty = ${available}`);
    line(`  pull      = min(available, quantity) = min(${available}, ${quantity}) = ${pull}`);

    const items = Array.from({ length: pull }, (_, i) => `present:${savedZoneCode}:${Date.now()}:${i}`);
    line(`\n  batch.items (${items.length}):`);
    for (const it of items.slice(0, 8)) line(`    ${it}`);
    if (items.length > 8) line(`    … +${items.length - 8} more`);

    // ── emitReadAndScheduleHops(): SimulatedRead + POST /reads ────────────
    line(`\n${"─".repeat(72)}`);
    line(`emitReadAndScheduleHops() — what happens to that batch`);
    line(`${"─".repeat(72)}`);
    line(`  1. prisma.simulatedRead.create({ items: [${items.length} ids], gtin: ${matchMode === "GTIN_LIST" && gtins.length === 1 ? JSON.stringify(gtins[0]) : "null"} })   — always written (local activity log)`);
    const tags = items.map(tagForItem).filter((t) => t !== null);
    line(`  2. real platform push:  sendReads() maps each id through tagForItem():`);
    line(`       ${items.length} ids → ${tags.length} submittable tag(s)`);
    line(`       tagForItem() results: ${JSON.stringify(items.slice(0, 3).map(tagForItem))}`);
    if (tags.length === 0) {
      line(`     ⇒ POST /datacollector/reads is SKIPPED — "no submittable tag identifiers in this batch"`);
    } else {
      line(`     ⇒ tags.length=${tags.length} > 0, so sendReads() DOES POST to the platform:`);
      line(`        POST ${resolveGatewayUrl(tenantUrl)}/datacollector/reads`);
      line(`        body: { collectorId, channelId, readTime, tags: ${JSON.stringify(tags.slice(0, 3))}${tags.length > 3 ? " …" : ""} }`);
    }

    const doPush = args.includes("--do-push");
    const pushCollector = val("--collector");
    const pushChannel = val("--channel") ?? "CH1";
    if (doPush && pushCollector && items.length > 0) {
      line(`\n  ── actually calling sendReads("${pushCollector}", "${pushChannel}", [${items.length} placeholder ids]) ──`);
      const r = await sendReads("", tenantUrl, apiKey, pushCollector, pushChannel, items, new Date());
      line(`  sendReads() → ${JSON.stringify(r, null, 2).split("\n").map((l) => "    " + l).join("\n").trim()}`);
    } else if (!doPush) {
      line(`\n  (pass --do-push --collector <ID> --channel <CH> to actually perform the POST /reads and show the platform's response)`);
    }

    line(`\n${"═".repeat(72)}`);
    line(`VERDICT`);
    line(`${"═".repeat(72)}`);
    if (available === 0) {
      line(`✗ available = 0 → empty batch → nothing scanned, nothing pushed.`);
      line(`  Check the stock JSON above: do any rows' zoneCode equal ${JSON.stringify(savedZoneCode)}?`);
      line(`  If stock rows exist but under a different zoneCode form, that's the BL-070 mismatch.`);
    } else {
      line(`✓ available = ${available} → batch of ${pull} placeholder item(s) is produced and a`);
      line(`  SimulatedRead is logged. The platform push is still skipped (counts, not EPCs).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
