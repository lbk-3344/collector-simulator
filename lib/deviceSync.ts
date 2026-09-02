import { getUserBartenderCredentials } from "@/lib/bartenderLocations";
import {
  buildCollectorRegistrationPayload,
  registerCollector,
  type RegistrableDevice,
} from "@/lib/bartenderDataCollector";

// Attempts a real POST /collectors/register for a Device config save that
// should sync to the platform — Publish, or any Save on an already-published
// Device (CLAUDE-CONCEPT.md section 15.8). Returns the extra fields to merge
// into the Prisma write. It NEVER throws and NEVER tells the caller to abort:
// a platform-call failure must not block the local config save. On failure
// only `lastSyncError` is returned (publishedAt / lastSyncedAt left untouched,
// so a failed resync never un-publishes a live Device and a failed first
// publish leaves it grey). On success `publishedAt` is set only if it wasn't
// already (first publish).
export async function buildPlatformSyncData(
  userId: string,
  device: RegistrableDevice,
  alreadyPublished: boolean
): Promise<Record<string, unknown>> {
  if (!device.collectorId) {
    return { lastSyncError: "A Collector ID is required to publish to the platform." };
  }

  let creds: { tenantUrl: string; apiKey: string } | null = null;
  try {
    creds = await getUserBartenderCredentials(userId);
  } catch {
    return { lastSyncError: "The stored Bartender API key could not be decrypted." };
  }
  if (!creds) {
    return { lastSyncError: "No Bartender connection configured — add one in Settings." };
  }

  const result = await registerCollector(
    userId,
    creds.tenantUrl,
    creds.apiKey,
    buildCollectorRegistrationPayload(device)
  );

  if (!result.ok) {
    return { lastSyncError: result.errorMessage ?? "Publish to Bartender failed." };
  }

  return {
    lastSyncedAt: new Date(),
    lastSyncError: null,
    platformReconciliation: (result.reconciliation ?? null) as object | null,
    ...(alreadyPublished ? {} : { publishedAt: new Date() }),
  };
}

// Narrow the loosely-typed object from buildDeviceConfigData() to the subset
// registerCollector needs — one place so both routes stay tidy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRegistrableDevice(data: any): RegistrableDevice {
  return {
    collectorId: typeof data.collectorId === "string" ? data.collectorId : null,
    name: String(data.name ?? ""),
    type: String(data.type ?? ""),
    locationCode: String(data.locationCode ?? ""),
    model: typeof data.model === "string" ? data.model : null,
    vendor: typeof data.vendor === "string" ? data.vendor : null,
    configVersion: typeof data.configVersion === "string" ? data.configVersion : null,
    attributes:
      data.attributes && typeof data.attributes === "object" ? data.attributes : null,
    channels: Array.isArray(data.channels) ? data.channels : null,
  };
}
