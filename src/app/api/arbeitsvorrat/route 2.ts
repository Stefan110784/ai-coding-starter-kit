import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok } from "@/lib/api-helpers";
import { mitarbeiterFuerBenutzer } from "@/lib/benutzer";
import { AKTIVE_STATUS, TAGESLISTE_ORDER, arbeitsvorratDict, offeneBuchungen } from "@/lib/arbeitsvorrat";

/** Mein Arbeitsvorrat: zugewiesene P/L-Aufträge + alle S-Aufträge (V2: GET /api/arbeitsvorrat). */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const mitarbeiter = await mitarbeiterFuerBenutzer(auth.benutzer);

  const auftraege = await prisma.auftrag.findMany({
    where: {
      status: { in: AKTIVE_STATUS },
      OR: [
        { nummer: { startsWith: "S" } },
        { team: { some: { mitarbeiterId: mitarbeiter.id } } },
      ],
    },
    orderBy: TAGESLISTE_ORDER,
  });

  const eingebucht = await offeneBuchungen(mitarbeiter.id);
  return ok({
    mitarbeiterId: mitarbeiter.id,
    auftraege: auftraege.map((a) => arbeitsvorratDict(a, eingebucht.has(a.id))),
  });
}
