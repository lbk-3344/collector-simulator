import { Role } from "@prisma/client";
import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    // Epoch ms of the last DB role re-check (lib/auth.ts) — throttles the
    // per-request re-check rather than dropping it (performance review
    // 2026-09-04).
    roleCheckedAt?: number;
    // Epoch ms of the last User.lastActiveAt write (lib/auth.ts, BL-089) —
    // throttles that write the same way roleCheckedAt throttles the re-check.
    lastActiveWrittenAt?: number;
  }
}
