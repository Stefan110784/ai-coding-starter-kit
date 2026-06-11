import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok } from "@/lib/api-helpers";
import { bestandJeArtikel, lagerplatzCode } from "@/lib/bestand";
import { reserviertJeArtikel } from "@/lib/reservierung";

/** Bestandsliste wie V2 /api/material/bestand: alle bestandsgeführten Artikel mit Summe. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const lagerortId = req.nextUrl.searchParams.get("lagerortId") ?? undefined;

  const [bestand, artikel, reserviert] = await Promise.all([
    bestandJeArtikel(prisma, lagerortId),
    prisma.artikel.findMany({
      where: { bestandAktiv: true },
      include: { lagerort: true },
      orderBy: { bezeichnung: "asc" },
    }),
    // Reservierungen sind lagerortübergreifend (wie das Netting)
    reserviertJeArtikel(prisma),
  ]);

  return ok(
    artikel.map((a) => {
      const b = bestand.get(a.artikelnummer) ?? 0;
      const res = reserviert.get(a.artikelnummer) ?? 0;
      return {
        artikelnummer: a.artikelnummer,
        bezeichnung: a.bezeichnung,
        bestand: b,
        // KF3-33: dispositive Sicht; unterMindest bleibt bewusst Lagersicht
        reserviert: res,
        verfuegbar: b - res,
        einheit: a.einheit,
        mindestbestand: a.mindestbestand,
        unterMindest: a.mindestbestand != null && b < a.mindestbestand,
        lagerort: a.lagerort?.name ?? null,
        lagerplatz: lagerplatzCode(a),
      };
    })
  );
}
