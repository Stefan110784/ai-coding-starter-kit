import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";
import { nettobedarfFuerAuftrag } from "@/lib/stueckliste";
import { lagerplatzCode } from "@/lib/bestand";

type Params = { params: Promise<{ auftragId: string }> };

/** Bedarf + Lagerorte + Abhak-Status für einen Auftrag (V2: kommissionierung_detail). */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { auftragId } = await params;
  const auftrag = await prisma.auftrag.findUnique({ where: { id: auftragId } });
  if (!auftrag) return err("Auftrag nicht gefunden", 404);

  const bedarf = await nettobedarfFuerAuftrag(prisma, auftragId);
  const nummern = bedarf.positionen.map((p) => p.artikelnummer);

  const [artikel, checks] = await Promise.all([
    nummern.length > 0
      ? prisma.artikel.findMany({
          where: { artikelnummer: { in: nummern } },
          include: { lagerort: { select: { name: true } } },
        })
      : Promise.resolve([]),
    prisma.kommissionierCheck.findMany({ where: { auftragId } }),
  ]);

  const lagerortMap = new Map(artikel.map((a) => [a.artikelnummer, a.lagerort?.name ?? null]));
  const lagerplatzMap = new Map(artikel.map((a) => [a.artikelnummer, lagerplatzCode(a)]));
  const checkMap = new Map(checks.map((c) => [c.artikelnummer, c.abgehakt]));

  // Anreichern + sortieren nach Lagerort (ohne Lagerort zuletzt), dann Artikelnummer
  const positionen = bedarf.positionen
    .map((p) => ({
      ...p,
      lagerort: lagerortMap.get(p.artikelnummer) ?? null,
      lagerplatz: lagerplatzMap.get(p.artikelnummer) ?? null,
      abgehakt: checkMap.get(p.artikelnummer) ?? false,
    }))
    .sort(
      (a, b) =>
        (a.lagerort ?? "￿").localeCompare(b.lagerort ?? "￿") ||
        a.artikelnummer.localeCompare(b.artikelnummer)
    );

  return ok({ auftragId, positionen });
}
