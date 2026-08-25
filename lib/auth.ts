import { PrismaAdapter } from "@auth/prisma-adapter";
import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { type Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { parseEnvList } from "@/lib/permissions";

// Resolves the role a brand-new user should get, per CLAUDE-CONCEPT.md section 4:
//   1. email in INITIAL_ADMIN_EMAILS  -> ADMIN (bootstrap, so someone can reach Settings -> Users at all)
//   2. email domain in AUTO_APPROVED_SSO_DOMAINS -> USER (no wait)
//   3. otherwise -> PENDING (stays PENDING, caller does nothing further)
function resolveAutoRole(email: string): Role | null {
  const normalized = email.toLowerCase();
  const domain = normalized.split("@")[1] ?? "";

  const initialAdmins = parseEnvList(process.env.INITIAL_ADMIN_EMAILS);
  if (initialAdmins.includes(normalized)) return "ADMIN";

  const autoApprovedDomains = parseEnvList(process.env.AUTO_APPROVED_SSO_DOMAINS);
  if (domain && autoApprovedDomains.includes(domain)) return "USER";

  return null;
}

export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — known @auth/prisma-adapter v2 + next-auth v4 type mismatch; works at runtime.
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Left as a pure allow — the adapter hasn't persisted a brand-new user yet by
    // the time this runs (it creates the row only after signIn resolves), so the
    // auto-approval/bootstrap-admin role assignment happens in the jwt callback
    // below instead, right after the user row is guaranteed to exist. Doing it here
    // by hand would race the adapter's own createUser() call on first sign-in.
    async signIn() {
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        let role = (user as { role: Role }).role;

        // Only ever auto-resolve out of PENDING — never touches a role an admin
        // already set. Safe to run on every sign-in, not just the very first one.
        if (role === "PENDING" && user.email) {
          const resolved = resolveAutoRole(user.email);
          if (resolved) {
            await prisma.user
              .update({ where: { id: user.id }, data: { role: resolved } })
              .catch(() => {});
            role = resolved;
          }
        }

        token.role = role;
      } else if (token.id) {
        // Re-check the DB on every subsequent request so a role change made by an
        // admin (validate / change role) takes effect immediately — no re-login
        // required, and this is also what makes the /auth/pending 30s poll work.
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          });
          if (dbUser) token.role = dbUser.role;
        } catch {
          // non-fatal — keep whatever role the token already carried
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
