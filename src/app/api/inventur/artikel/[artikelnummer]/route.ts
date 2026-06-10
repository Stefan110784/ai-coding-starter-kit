import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { bestandFuerArtikel, bestandJeLagerort, lagerplatzCode } from "@/lib/bestand";

type Params = { params: Promise<{ artikelnummer: string }> };

/** Artikel-Detail mit Bestand je Lagerort (V2: GET /api/inventur/artikel/{nr}). */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const { artikelnummer } = await params;
  const nr = decodeURIComponent(artikelnummer);
  const artikel = await prisma.artikel.findUnique({ where: { artikelnummer: nr } });
  if (!artikel) return err("Artikel nicht gefunden", 404);

  const [bestand, lagerorte, zuletzt] = await Promise.all([
    bestandFuerArtikel(prisma, nr),
    bestandJeLagerort(prisma, nr),
    prisma.inventurZaehlung.findFirst({
      where: { artikelnummer: nr, status: { not: "verworfen" } },
      orderBy: { erfasstAm: "desc" },
      select: { erfasstAm: true },
    }),
  ]);

  return ok({
    artikelnummer: artikel.artikelnummer,
    bezeichnung: artikel.bezeichnung,
    einheit: artikel.einheit,
    bestand,
    lagerplatz: lagerplatzCode(artikel),
    zuletztGezaehltAm: zuletzt?.erfasstAm ?? null,
    lagerorte,
  });
}
