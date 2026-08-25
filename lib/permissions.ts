import { type Role } from "@prisma/client";

export function isAdmin(role: Role | string | null | undefined): boolean {
  return role === "ADMIN";
}

export function isPending(role: Role | string | null | undefined): boolean {
  return role === "PENDING";
}

// Comma-separated env vars (AUTO_APPROVED_SSO_DOMAINS, INITIAL_ADMIN_EMAILS) → clean list.
export function parseEnvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}
