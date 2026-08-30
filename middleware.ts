import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// Requires auth on every route except /login and /auth/pending (NextAuth's own
// /api/auth/* is excluded via the matcher below). PENDING-role users are kept on
// /auth/pending until an admin validates them — except /settings and its API
// routes, which stay reachable so a PENDING user can still set up their own
// Bartender connection (open to every role, see CLAUDE-CONCEPT.md section 7.1).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublicPage = pathname === "/login" || pathname === "/auth/pending";
  const isPendingAllowedPage =
    pathname === "/auth/pending" || pathname === "/settings" || pathname.startsWith("/api/settings/");

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    if (isPublicPage) return NextResponse.next();
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string | undefined;

  if (pathname === "/login") {
    return NextResponse.redirect(new URL(role === "PENDING" ? "/auth/pending" : "/", req.url));
  }

  if (role === "PENDING" && !isPendingAllowedPage) {
    return NextResponse.redirect(new URL("/auth/pending", req.url));
  }

  if (role !== "PENDING" && pathname === "/auth/pending") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except: NextAuth's own routes, the CRON_SECRET-guarded run
    // engine tick (BL-061), Next internals, and static/image files.
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
