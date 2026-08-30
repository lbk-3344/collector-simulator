import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { GatewayResult } from "@/lib/bartenderLocations";

// Client for Bartender's LEGACY Product API (`product-api`) — see
// CLAUDE-CONCEPT.md section 7.7. Temporary stand-in until `master-data-api`
// is available, so this is kept a deliberately thin, swappable module.
//
// Tenant-relative (`{tenantUrl}/product-api/rest/...`), NOT a fixed gateway
// host — same pattern as `statemachine-api-configuration` (7.2/7.4). HTTP
// Basic auth reusing the stored Track & Trace username/password (7.4), no
// fourth credential type. `Accept-version` differs per endpoint, on purpose
// (v3.6 for lists, v3.5 for by-GTIN — confirmed against the sandbox, not a
// typo to normalise).

export interface BartenderProduct {
  gtin: string;
  displayGtin?: string;
  productCode?: string;
  productLabelShort?: string;
  productLabelLong?: string;
  categoryParent?: string;
  categoryLevel1Code?: string;
  categoryLevel1Label?: string;
  brandLabel?: string;
  imageURL?: string;
  [key: string]: unknown;
}

export interface BartenderCategory {
  categoryId: string;
  categoryName: string;
  categoryParent: string; // "" for a top-level category
  categoryLevel: string; // "categoryLevel1" | "categoryLevel2" | ...
  [key: string]: unknown;
}

async function getBasicAuthCreds(
  userId: string
): Promise<{ tenantUrl: string; username: string; password: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bartenderTenantUrl: true, bartenderUsername: true, bartenderPasswordCiphertext: true },
  });
  if (!user?.bartenderTenantUrl || !user.bartenderUsername || !user.bartenderPasswordCiphertext) {
    return null;
  }
  return {
    tenantUrl: user.bartenderTenantUrl,
    username: user.bartenderUsername,
    password: decrypt(user.bartenderPasswordCiphertext),
  };
}

/** Resolve the caller's Product-API credentials, or a GatewayResult error to hand straight back. */
export async function resolveProductApi(
  userId: string
): Promise<{ ok: true; tenantUrl: string; username: string; password: string } | { ok: false; error: string; status: number }> {
  const creds = await getBasicAuthCreds(userId).catch(() => null);
  if (!creds) {
    return {
      ok: false,
      status: 400,
      error: "Set your Track & Trace username and password in Settings → Bartender Connection first.",
    };
  }
  return { ok: true, ...creds };
}

async function callProductApi<T>(
  tenantUrl: string,
  username: string,
  password: string,
  path: string,
  acceptVersion: "v3.5" | "v3.6"
): Promise<GatewayResult<T>> {
  const url = `${tenantUrl.replace(/\/+$/, "")}/product-api/rest${path}`;
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: auth, "Accept-version": acceptVersion },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach the Product API — check the tenant URL." };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Bartender rejected the Track & Trace username/password.", status: res.status };
  }
  if (!res.ok) {
    return { ok: false, error: `The Product API returned HTTP ${res.status}.`, status: res.status };
  }

  const data = await res.json().catch(() => null);
  if (data === null) return { ok: false, error: "Unexpected response from the Product API." };
  return { ok: true, data: data as T };
}

// GET /products?showAttributes=true — a plain array, no server-side search or
// pagination (confirmed 2026-08-30: ?page/?search are ignored). Callers fetch
// once and filter client-side; ~197 products on the sandbox today.
export function listProducts(
  tenantUrl: string,
  username: string,
  password: string
): Promise<GatewayResult<BartenderProduct[]>> {
  return callProductApi<BartenderProduct[]>(tenantUrl, username, password, "/products?showAttributes=true", "v3.6");
}

// GET /products/{gtin} — Accept-version v3.5 (deliberately different from the
// list call). Returns the same object minus inScopeTraceability/attributes.
export function getProduct(
  tenantUrl: string,
  username: string,
  password: string,
  gtin: string
): Promise<GatewayResult<BartenderProduct>> {
  return callProductApi<BartenderProduct>(
    tenantUrl,
    username,
    password,
    `/products/${encodeURIComponent(gtin)}`,
    "v3.5"
  );
}

// GET /categories?show_level=true — plain array, category tree via categoryParent.
export function listCategories(
  tenantUrl: string,
  username: string,
  password: string
): Promise<GatewayResult<BartenderCategory[]>> {
  return callProductApi<BartenderCategory[]>(tenantUrl, username, password, "/categories?show_level=true", "v3.6");
}
