import { prisma } from "@/lib/prisma";

// `{locationCode}-{type}-{NN}` — NN the lowest 2-digit sequence NOT already
// used by a Device at that Site+Type pair. BL-050.
//
// Shared by `GET /api/devices/suggest-code` (the config screen's auto-fill)
// and `POST /api/devices/[id]/duplicate` (a clone always gets a fresh id —
// copying the source's would violate `Device.collectorId`'s @unique).
//
// Fixed 2026-09-01: was `count(existing) + 1`, which collides the moment a
// collectorId was assigned out of sequence — e.g. a Device manually named
// `TTMEMBASE-SHELF-02` (matching a real platform collector) with no `-01`
// present made the next suggestion `…-02` too, so `create` threw a unique-
// constraint error and duplication just failed. Now it scans for the first
// genuinely free slot instead.
export async function suggestCollectorId(locationCode: string, type: string): Promise<string> {
  const prefix = `${locationCode}-${type}-`;
  const rows = await prisma.device.findMany({
    where: { collectorId: { startsWith: prefix } },
    select: { collectorId: true },
  });
  const taken = new Set(rows.map((d) => d.collectorId).filter((c): c is string => !!c));
  for (let n = 1; n <= 999; n++) {
    const candidate = `${prefix}${String(n).padStart(2, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 999 slots taken — pathological; fall back to a guaranteed-unique suffix.
  return `${prefix}${Date.now()}`;
}
