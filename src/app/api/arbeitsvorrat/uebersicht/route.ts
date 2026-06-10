import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, ok } from "@/lib/api-helpers";
import { AKTIVE_STATUS } from "@/lib/arbeitsvorrat";

/** Alle aktiven P/L-Aufträge mit Zuweisungen — Admin-Übersicht (V2: /uebersicht). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const auftraege = await prisma.auftrag.findMany({
    where: {
      status: { in: AKTIVE_STATUS },
      OR: [{ nummer: { startsWith: "P" } }, { nummer: { startsWith: "L" } }],
    },
    include: {
      team: {
        include: { mitarbeiter: { select: { id: true, name: true, kuerzel: true } } },
        orderBy: { mitarbeiter: { name: "asc" } },
      },
    },
    orderBy: { nummer: "asc" },
  });

  return ok(
    auftraege.map((a) => ({
      id: a.id,
      nummer: a.nummer,
      bezeichnung: a.bezeichnung,
      status: a.status,
      mitarbeiter: a.team.map((t) => t.mitarbeiter),
    }))
  );
}
