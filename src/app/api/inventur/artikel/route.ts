import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, ok } from "@/lib/api-helpers";
import { bestandJeArtikel, lagerplatzCode } from "@/lib/bestand";

/** Artikel-Auswahl für die Inventur (V2: GET /api/inventur/artikel). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const suche = req.nextUrl.searchParams.get("suche")?.trim() ?? "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 200);

  const artikel = await prisma.artikel.findMany({
    where: {
      bestandAktiv: true,
      ...(suche
        ? {
            OR: [
              { artikelnummer: { contains: suche, mode: "insensitive" } },
              { bezeichnung: { contains: suche, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { bezeichnung: "asc" },
    take: limit,
  });

  const [bestand, zuletzt] = await Promise.all([
    bestandJeArtikel(prisma),
    prisma.inventurZaehlung.groupBy({
      by: ["artikelnummer"],
      where: {
        artikelnummer: { in: artikel.map((a) => a.artikelnummer) },
        status: { not: "verworfen" },
      },
      _max: { erfasstAm: true },
    }),
  ]);
  const zuletztMap = new Map(zuletzt.map((z) => [z.artikelnummer, z._max.erfasstAm]));

  return ok(
    artikel.map((a) => ({
      artikelnummer: a.artikelnummer,
      bezeichnung: a.bezeichnung,
      einheit: a.einheit,
      bestand: bestand.get(a.artikelnummer) ?? 0,
      zuletztGezaehltAm: zuletztMap.get(a.artikelnummer) ?? null,
      lagerplatz: lagerplatzCode(a),
    }))
  );
}
