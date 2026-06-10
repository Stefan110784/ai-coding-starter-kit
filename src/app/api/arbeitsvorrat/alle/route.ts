import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok } from "@/lib/api-helpers";
import { mitarbeiterFuerBenutzer } from "@/lib/benutzer";
import { AKTIVE_STATUS, arbeitsvorratDict, offeneBuchungen } from "@/lib/arbeitsvorrat";

/** Alle aktiven Aufträge (Toggle-Ansicht; V2: GET /api/arbeitsvorrat/alle). */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const mitarbeiter = await mitarbeiterFuerBenutzer(auth.benutzer);

  const auftraege = await prisma.auftrag.findMany({
    where: { status: { in: AKTIVE_STATUS } },
    orderBy: { nummer: "asc" },
  });

  const eingebucht = await offeneBuchungen(mitarbeiter.id);
  return ok({
    mitarbeiterId: mitarbeiter.id,
    auftraege: auftraege.map((a) => arbeitsvorratDict(a, eingebucht.has(a.id))),
  });
}
