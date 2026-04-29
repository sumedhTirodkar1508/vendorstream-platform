import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const AUTH_ROUTES = ["/login", "/signup", "/verify-email"] as const;
const PROTECTED_ROUTE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/lp",
  "/store",
  "/audit",
  "/notifications",
] as const;

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function getDefaultWorkspaceHref(role?: string) {
  if (role === "ADMIN") {
    return "/admin/dashboard";
  }

  if (role === "FINANCE_VIEWER") {
    return "/audit";
  }

  return "/dashboard";
}

function getLoginRedirectUrl(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (nextPath && nextPath !== "/") {
    loginUrl.searchParams.set("next", nextPath);
  }

  return loginUrl;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = await getToken({ req: request }).catch(() => null);
  const isAuthPage = isAuthRoute(pathname);
  const requiresAuthentication = isProtectedRoute(pathname);
  const defaultWorkspaceHref = getDefaultWorkspaceHref(token?.systemRole);

  // 1) If logged in, keep them out of auth pages
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL(defaultWorkspaceHref, request.url));
  }

  // 2) If not logged in, block protected routes
  if (!token && requiresAuthentication) {
    return NextResponse.redirect(getLoginRedirectUrl(request));
  }

  // 3) If logged in but NOT admin, block /admin/*
  if (token && pathname.startsWith("/admin") && token.systemRole !== "ADMIN") {
    return NextResponse.redirect(new URL(defaultWorkspaceHref, request.url));
  }

  // 4) If logged in but missing operations role, block /audit
  if (
    token &&
    pathname.startsWith("/audit") &&
    token.systemRole !== "ADMIN" &&
    token.systemRole !== "FINANCE_VIEWER"
  ) {
    return NextResponse.redirect(new URL(defaultWorkspaceHref, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/verify-email",
    "/admin/:path*",
    "/dashboard/:path*",
    "/lp/:path*",
    "/store/:path*",
    "/audit/:path*",
    "/notifications/:path*",
  ],
};
