import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { hatRecht } from "@/lib/rechte";
import type { Benutzer } from "@/generated/prisma";

export async function requireAuth(
  req: NextRequest
): Promise<{ benutzer: Benutzer } | NextResponse> {
  const benutzer = await getSession();
  if (!benutzer) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  return { benutzer };
}

/** Wie requireAuth, verlangt zusätzlich die Admin-Rolle. */
export async function requireAdmin(
  req: NextRequest
): Promise<{ benutzer: Benutzer } | NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.benutzer.rolle !== "admin") {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }
  return auth;
}

/** Wie requireAuth, verlangt zusätzlich ein bestimmtes Recht (Admin hat immer alle). */
export async function requireRecht(
  req: NextRequest,
  key: string
): Promise<{ benutzer: Benutzer } | NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!hatRecht(auth.benutzer, key)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }
  return auth;
}

/**
 * Übersetzt bekannte Prisma-Fehler in saubere HTTP-Antworten mit deutschen Texten.
 * In jeder schreibenden Route in einem try/catch verwenden, damit gelöschte IDs
 * oder Constraint-Verletzungen keinen 500-Crash auslösen.
 */
export function handlePrismaError(e: unknown): NextResponse {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case "P2025": // Record not found (update/delete)
      return err("Datensatz nicht gefunden", 404);
    case "P2002": // Unique constraint
      return err("Wert bereits vergeben", 409);
    case "P2003": // Foreign key constraint
      return err("Datensatz wird noch verwendet und kann nicht gelöscht werden", 409);
    default:
      console.error("Unerwarteter DB-Fehler:", e);
      return err("Interner Fehler", 500);
  }
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
