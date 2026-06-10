import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const jetzt = new Date();
  const heuteStart = new Date(jetzt);
  heuteStart.setHours(0, 0, 0, 0);
  const vor7Tagen = new Date(jetzt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const vor30Tagen = new Date(jetzt.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    angemeldeteZeiten,
    auftraegeNachStatus,
    heuteAbgeschlossen,
    laufendeAuftraege,
    zeitenHeute,
    qualitaet7Tage,
    zeitenProMitarbeiter7Tage,
  ] = await Promise.all([
    // Aktuell aktive Zeitbuchungen (kein Ende)
    prisma.auftragszeit.findMany({
      where: { ende: null },
      include: {
        mitarbeiter: { select: { id: true, name: true, kuerzel: true } },
        auftrag: { select: { id: true, nummer: true, bezeichnung: true, status: true } },
        kategorie: { select: { name: true } },
      },
      orderBy: { start: "asc" },
    }),

    // Aufträge nach Status
    prisma.auftrag.groupBy({
      by: ["status"],
      _count: { id: true },
    }),

    // Heute abgeschlossene Aufträge
    prisma.auftrag.count({
      where: { status: "abgeschlossen", ende: { gte: heuteStart } },
    }),

    // Laufende Aufträge mit Details
    prisma.auftrag.findMany({
      where: { status: "laeuft" },
      include: {
        zeiten: {
          where: { ende: null },
          include: { mitarbeiter: { select: { name: true, kuerzel: true } } },
        },
      },
      orderBy: { erstelltAm: "asc" },
      take: 10,
    }),

    // Zeitbuchungen heute
    prisma.auftragszeit.count({
      where: { start: { gte: heuteStart }, istNachtrag: false },
    }),

    // Qualität letzte 7 Tage
    prisma.qualitaet.aggregate({
      where: { zeitstempel: { gte: vor7Tagen } },
      _sum: { gut: true, ausschuss: true, nacharbeit: true },
    }),

    // Stunden pro Mitarbeiter letzte 7 Tage
    prisma.auftragszeit.findMany({
      where: {
        start: { gte: vor7Tagen },
        ende: { not: null },
        istNachtrag: false,
      },
      include: {
        mitarbeiter: { select: { name: true, kuerzel: true } },
      },
    }),
  ]);

  // Stunden pro Mitarbeiter aggregieren
  const stundenMap: Record<string, { name: string; kuerzel: string; stunden: number }> = {};
  for (const z of zeitenProMitarbeiter7Tage) {
    if (!z.ende) continue;
    const sek = (z.ende.getTime() - z.start.getTime()) / 1000;
    const k = z.mitarbeiter.kuerzel;
    if (!stundenMap[k]) {
      stundenMap[k] = { name: z.mitarbeiter.name, kuerzel: k, stunden: 0 };
    }
    stundenMap[k].stunden += sek / 3600;
  }
  const stundenProMitarbeiter = Object.values(stundenMap)
    .map((m) => ({ ...m, stunden: Math.round(m.stunden * 10) / 10 }))
    .sort((a, b) => b.stunden - a.stunden);

  // Aktuell angemeldete mit Dauer berechnen
  const angemeldete = angemeldeteZeiten.map((z) => ({
    id: z.id,
    mitarbeiter: z.mitarbeiter,
    auftrag: z.auftrag,
    kategorie: z.kategorie,
    start: z.start.toISOString(),
    dauerMin: Math.round((jetzt.getTime() - z.start.getTime()) / 60000),
  }));

  const q7 = {
    gut: qualitaet7Tage._sum.gut ?? 0,
    ausschuss: qualitaet7Tage._sum.ausschuss ?? 0,
    nacharbeit: qualitaet7Tage._sum.nacharbeit ?? 0,
  };

  return ok({
    angemeldete,
    auftraegeNachStatus: auftraegeNachStatus.map((a) => ({
      status: a.status,
      anzahl: a._count.id,
    })),
    heuteAbgeschlossen,
    zeitenHeute,
    laufendeAuftraege,
    qualitaet7Tage: q7,
    stundenProMitarbeiter,
    aktualisiertUm: jetzt.toISOString(),
  });
}
