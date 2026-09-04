import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
export function middleware(req:NextRequest){const path=req.nextUrl.pathname;if(path.startsWith("/delivery")||path.startsWith("/admin")){if(!req.cookies.get(process.env.SESSION_COOKIE_NAME||"urgent_medicine_session"))return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(path)}`,req.url));}return NextResponse.next();}
export const config={matcher:["/delivery/:path*","/admin/:path*"]};
