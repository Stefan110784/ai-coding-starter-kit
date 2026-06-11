import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";
import {
  nettobedarfFuerAuftrag,
  bedarfsbaumFuerAuftrag,
  sollSekundenNetto,
  type BedarfPosition,
} from "@/lib/stueckliste";

type Params = { params: Promise<{ auftragId: string }> };

/**
 * Nettobedarf + Soll-Zeit + Strukturbaum eines Auftrags (V2: /api/material/bedarf/{id}).
 * Existiert ein Material-Snapshot (eingefroren bei Kommissionierung, KF3-28),
 * kommen die Positionen aus dem Snapshot statt der Live-Auflösung — ISO 7.5:
 * „welcher Materialstand galt für diesen Auftrag".
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { auftragId } = await params;
  const auftrag = await prisma.auftrag.findUnique({ where: { id: auftragId } });
  if (!auftrag) return err("Auftrag nicht gefunden", 404);

  const snapshot = await prisma.auftragMaterialSnapshot.findMany({
    where: { auftragId },
    orderBy: { artikelnummer: "asc" },
  });

  const [sollSekundenNettoWert, baum] = await Promise.all([
    sollSekundenNetto(prisma, auftragId),
    bedarfsbaumFuerAuftrag(prisma, auftragId),
  ]);

  if (snapshot.length > 0) {
    const positionen: BedarfPosition[] = snapshot.map((s) => ({
      artikelnummer: s.artikelnummer,
      bezeichnung: s.bezeichnung,
      einheit: s.einheit,
      bruttobedarf: s.bruttobedarf,
      bestand: s.bestand,
      nettobedarf: s.nettobedarf,
      ausLager: s.ausLager,
      typ: s.typ as BedarfPosition["typ"],
    }));
    const mangelnd = positionen.filter((p) => p.nettobedarf > 0 && p.bestand < p.bruttobedarf);
    return ok({
      positionen,
      mangel: mangelnd.length > 0,
      mangelnd,
      sollSekundenNetto: sollSekundenNettoWert,
      baum,
      eingefroren: true,
      eingefrorenAm: snapshot[0].erstelltAm,
    });
  }

  const bedarf = await nettobedarfFuerAuftrag(prisma, auftragId);
  return ok({ ...bedarf, sollSekundenNetto: sollSekundenNettoWert, baum, eingefroren: false });
}
