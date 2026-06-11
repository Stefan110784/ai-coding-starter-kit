import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const von = searchParams.get("von")
    ? new Date(searchParams.get("von")!)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bis = searchParams.get("bis") ? new Date(searchParams.get("bis")!) : new Date();

  const [auftraege, zeiten, qualitaet] = await Promise.all([
    prisma.auftrag.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.auftragszeit.findMany({
      where: {
        start: { gte: von },
        ende: { lte: bis },
        istNachtrag: false,
      },
      include: {
        mitarbeiter: { select: { name: true, kuerzel: true } },
        auftrag: { select: { nummer: true, bezeichnung: true } },
      },
    }),
    prisma.qualitaet.findMany({
      where: { zeitstempel: { gte: von, lte: bis } },
    }),
  ]);

  // Zeiten pro Mitarbeiter aggregieren
  const zeitenProMitarbeiter: Record<
    string,
    { name: string; kuerzel: string; sekunden: number }
  > = {};
  for (const z of zeiten) {
    if (!z.ende) continue;
    const sek = (z.ende.getTime() - z.start.getTime()) / 1000;
    const k = z.mitarbeiter.kuerzel;
    if (!zeitenProMitarbeiter[k]) {
      zeitenProMitarbeiter[k] = { name: z.mitarbeiter.name, kuerzel: k, sekunden: 0 };
    }
    zeitenProMitarbeiter[k].sekunden += sek;
  }

  // Qualität aggregieren
  type QSumme = { gut: number; ausschuss: number; nacharbeit: number };
  const qualitaetGesamt = qualitaet.reduce(
    (acc: QSumme, q: QSumme) => ({
      gut: acc.gut + q.gut,
      ausschuss: acc.ausschuss + q.ausschuss,
      nacharbeit: acc.nacharbeit + q.nacharbeit,
    }),
    { gut: 0, ausschuss: 0, nacharbeit: 0 }
  );

  return ok({
    auftraegeNachStatus: auftraege.map((a: { status: string; _count: { id: number } }) => ({
      status: a.status,
      anzahl: a._count.id,
    })),
    zeitenProMitarbeiter: Object.values(zeitenProMitarbeiter),
    qualitaet: qualitaetGesamt,
    zeitraum: { von: von.toISOString(), bis: bis.toISOString() },
  });
}
