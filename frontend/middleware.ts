import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard", "/search", "/cart", "/checkout", "/orders", "/prescriptions", "/addresses", "/profile", "/notifications", "/support", "/delivery", "/admin"];
const sessionCookie = process.env.SESSION_COOKIE_NAME ?? "urgent_medicine_session";

export function middleware(req: NextRequest) {
  const isProtected = protectedPrefixes.some(prefix => req.nextUrl.pathname === prefix || req.nextUrl.pathname.startsWith(`${prefix}/`));
  if (!isProtected) return NextResponse.next();
  if (req.cookies.has(sessionCookie)) return NextResponse.next();
  const login = new URL("/login", req.url);
  const returnTo = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  login.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/dashboard/:path*", "/search/:path*", "/cart/:path*", "/checkout/:path*", "/orders/:path*", "/prescriptions/:path*", "/addresses/:path*", "/profile/:path*", "/notifications/:path*", "/support/:path*", "/delivery/:path*", "/admin/:path*"] };
