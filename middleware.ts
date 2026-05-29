import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE = "admin_token";

const intlMiddleware = createIntlMiddleware({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin route protection — cookie presence check (JWT verified in layout/API)
  if (pathname.startsWith("/admin")) {
    if (!pathname.startsWith("/admin/login")) {
      const token = req.cookies.get(ADMIN_COOKIE)?.value;
      if (!token) {
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
    }
    return NextResponse.next();
  }

  // API routes pass through
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Public pages go through next-intl
  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
