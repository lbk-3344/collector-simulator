import { prisma } from "@/lib/prisma";

// `{locationCode}-{type}-{NN}` — NN a zero-padded 2-digit sequence counting
// every existing Device at that Site+Type pair (configured or still a bare
// shell), so a suggestion never collides with an in-progress one. BL-050.
//
// Shared by `GET /api/devices/suggest-code` (the config screen's auto-fill)
// and `POST /api/devices/[id]/duplicate` (a clone always gets a fresh id —
// copying the source's would violate `Device.collectorId`'s @unique).
export async function suggestCollectorId(locationCode: string, type: string): Promise<string> {
  const count = await prisma.device.count({ where: { locationCode, type } });
  const nn = String(count + 1).padStart(2, "0");
  return `${locationCode}-${type}-${nn}`;
}
