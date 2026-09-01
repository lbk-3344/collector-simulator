import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { resolveGatewayUrl, listLocations } from "@/lib/bartenderLocations";
import { getStock } from "@/lib/bartenderInventory";

// BL-070 Phase 0 — one-off live check: does a Location API zone's `bizLocation`
// equal (or clearly correspond to) an Inventory API stock row's `zoneCode`?
// Confirms or kills the hypothesis in CLAUDE-CONCEPT.md §7.3 before any code
// change. See claude-code-prompt-BL070-present-feed-zone-fix.md.
//
//   npx tsx scripts/verify-bl070-zone-match.ts [email] [--location CODE]

interface RawZoneFull {
  zoneCode?: string;
  zoneName?: string;
  code?: string;
  name?: string;
  type?: string | null;
  bizLocation?: string | null;
  sgln?: string | null;
  position?: { x: number; y: number };
  [k: string]: unknown;
}

async function main() {
  const args = process.argv.slice(2);
  const emailArg = args.find((a) => !a.startsWith("--") && a.includes("@"));
  const email = emailArg ?? "lbellissard@seagullsoftware.com";
  const locIdx = args.indexOf("--location");
  const wantLocation = locIdx >= 0 ? args[locIdx + 1] : undefined;

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { bartenderTenantUrl: true, bartenderApiKeyCiphertext: true },
    });
    if (!user?.bartenderTenantUrl || !user.bartenderApiKeyCiphertext) {
      console.error(
        `\n✗ User ${email} has no stored Bartender connection (tenant URL + API key). ` +
          `Pass a different email as the first CLI arg, or configure that user's Settings → Bartender Connection first.\n`
      );
      process.exit(1);
    }
    const tenantUrl = user.bartenderTenantUrl;
    const apiKey = decrypt(user.bartenderApiKeyCiphertext);
    console.log(`user            : ${email}`);
    console.log(`tenantUrl       : ${tenantUrl}`);
    console.log(`gateway         : ${resolveGatewayUrl(tenantUrl)}`);
    console.log(`apiKey (last 4) : ${apiKey.slice(-4)}\n`);

    // 1. list locations
    const locRes = await listLocations(tenantUrl, apiKey);
    if (!locRes.ok) {
      console.error(`✗ listLocations failed: ${locRes.error}`);
      process.exit(1);
    }
    console.log(`── locations (${locRes.data.length}) ──`);
    for (const l of locRes.data) console.log(`   ${l.code}  ${l.name ?? ""}`);
    console.log();

    // choose which locations to probe
    const candidates = wantLocation
      ? locRes.data.filter((l) => l.code === wantLocation)
      : locRes.data;
    if (candidates.length === 0) {
      console.error(`✗ --location ${wantLocation} not found among the listed codes.`);
      process.exit(1);
    }

    let anyMatch = false;

    for (const loc of candidates) {
      const code = loc.code;
      // 3. RAW zones call — need bizLocation/sgln, which getLocationZones drops
      const zonesUrl = `${resolveGatewayUrl(tenantUrl)}/locations/${encodeURIComponent(code)}/zones`;
      let zonesBody: { zones?: RawZoneFull[] } | null = null;
      try {
        const r = await fetch(zonesUrl, { headers: { apikey: apiKey }, cache: "no-store" });
        const raw = await r.text();
        if (!r.ok) {
          console.log(`\n══ ${code} (${loc.name ?? ""}) ══  zones: HTTP ${r.status} — skipping`);
          continue;
        }
        zonesBody = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.log(`\n══ ${code} ══  zones fetch error: ${(e as Error).message} — skipping`);
        continue;
      }
      const zones = zonesBody?.zones ?? [];
      if (zones.length === 0) {
        console.log(`\n══ ${code} (${loc.name ?? ""}) ══  no zones — skipping`);
        continue;
      }

      console.log(`\n══════════ ${code} (${loc.name ?? ""}) ══════════`);
      console.log(`  zones from Location API (raw):`);
      for (const z of zones) {
        console.log(
          `    code=${JSON.stringify(z.zoneCode ?? z.code)}  name=${JSON.stringify(z.zoneName ?? z.name)}  ` +
            `bizLocation=${JSON.stringify(z.bizLocation)}  sgln=${JSON.stringify(z.sgln)}`
        );
      }

      // 4. unfiltered stock grouped by zone
      const stock = await getStock(tenantUrl, apiKey, { groupBy: "zone", locationCode: code });
      if (!stock.ok) {
        console.log(`  stock: ✗ ${stock.errorMessage}`);
        continue;
      }
      console.log(`  stock rows from Inventory API (groupBy=zone, ${stock.results.length}):`);
      for (const s of stock.results) {
        console.log(`    zoneCode=${JSON.stringify(s.zoneCode)}  zoneName=${JSON.stringify(s.zoneName)}  qty=${s.qty}`);
      }
      const stockZoneCodes = stock.results.map((s) => s.zoneCode).filter(Boolean) as string[];

      // 5. compare
      console.log(`  ── comparison ──`);
      for (const z of zones) {
        const zcode = z.zoneCode ?? z.code;
        const biz = z.bizLocation ?? null;
        const exact = biz != null && stockZoneCodes.includes(biz);
        const suffix =
          biz != null &&
          stockZoneCodes.some((sc) => sc.endsWith(biz) || biz.endsWith(sc) || sc.split(".").pop() === biz.split(".").pop());
        const codeExact = zcode != null && stockZoneCodes.includes(zcode);
        let verdict = "FAIL — no correspondence";
        if (exact) verdict = `PASS — bizLocation exactly equals a stock zoneCode (${biz})`;
        else if (codeExact) verdict = `PASS(?) — the plain zone code already matches a stock zoneCode (${zcode}) — bizLocation not needed`;
        else if (suffix) verdict = `PARTIAL — bizLocation "${biz}" corresponds to a stock zoneCode by prefix/suffix — document the transform`;
        if (exact || codeExact || suffix) anyMatch = true;
        console.log(`    zone ${JSON.stringify(zcode)}: ${verdict}`);
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(anyMatch ? "RESULT: at least one zone matched — hypothesis supported, proceed." : "RESULT: NO zone matched — hypothesis NOT confirmed, STOP and report.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
