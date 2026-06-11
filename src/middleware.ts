import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "kima_session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/setup"];

// Methoden, die Serverzustand ändern und daher gegen CSRF abgesichert werden.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF-Basisschutz: zustandsändernde API-Anfragen müssen vom selben Origin
  // kommen. Fehlt der Origin-Header (z. B. Server-zu-Server), wird nicht
  // blockiert; bei vorhandenem, fremdem Origin → 403.
  if (pathname.startsWith("/api") && MUTATING_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      // Hinter einem Reverse-Proxy kann der echte Host in x-forwarded-host stehen.
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = "";
      }
      if (host && originHost && originHost !== host) {
        return NextResponse.json({ error: "Ungültiger Origin" }, { status: 403 });
      }
    }
  }

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Vollständige Session-Validierung gegen DB erfolgt in den API-Routen
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
