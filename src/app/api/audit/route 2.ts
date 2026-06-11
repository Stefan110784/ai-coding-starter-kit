import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";
import { hatRecht } from "@/lib/rechte";

/**
 * Audit-Historie lesen (KF3-25). Gefiltert je Entität für jeden angemeldeten
 * Benutzer (z. B. Verlauf-Tab am Auftrag); der ungefilterte Gesamtauszug
 * verlangt das Verwaltungs-Recht.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const entitaet = searchParams.get("entitaet");
  const entitaetId = searchParams.get("entitaetId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);

  if ((!entitaet || !entitaetId) && !hatRecht(auth.benutzer, "verwaltung")) {
    return err("Gesamtauszug nur mit Verwaltungs-Recht", 403);
  }

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(entitaet ? { entitaet } : {}),
      ...(entitaetId ? { entitaetId } : {}),
    },
    include: { benutzer: { select: { username: true, name: true } } },
    orderBy: { zeitstempel: "desc" },
    take: limit,
  });

  return ok(events);
}
