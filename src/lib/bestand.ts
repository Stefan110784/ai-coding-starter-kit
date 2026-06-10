/**
 * Bestandsabfragen (V2: services/material.py).
 *
 * Konvention wie V2: `menge` ist vorzeichenbehaftet gespeichert
 * (Entnahme negativ, Zugang positiv, Umlagerung = ±Zeilenpaar),
 * der Bestand ist daher eine schlichte Summe über alle Bewegungen.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma";

export type Db = PrismaClient | Prisma.TransactionClient;

/** Aktueller Bestand je Artikelnummer, optional auf einen Lagerort gefiltert. */
export async function bestandJeArtikel(
  db: Db,
  lagerortId?: string
): Promise<Map<string, number>> {
  const rows = await db.materialbewegung.groupBy({
    by: ["artikelnummer"],
    where: lagerortId ? { lagerortId } : undefined,
    _sum: { menge: true },
  });
  return new Map(rows.map((r) => [r.artikelnummer, r._sum.menge ?? 0]));
}

/** Gesamtbestand eines Artikels über alle Lagerorte. */
export async function bestandFuerArtikel(
  db: Db,
  artikelnummer: string
): Promise<number> {
  const row = await db.materialbewegung.aggregate({
    where: { artikelnummer },
    _sum: { menge: true },
  });
  return row._sum.menge ?? 0;
}

/**
 * Bestand eines Artikels je Lagerort (nur Orte mit Bestand ≠ 0),
 * absteigend sortiert — der erste Eintrag ist der Default-Vorschlag
 * für die Inventur-Korrektur.
 */
export async function bestandJeLagerort(
  db: Db,
  artikelnummer: string
): Promise<Array<{ lagerortId: string; name: string; bestand: number }>> {
  const rows = await db.materialbewegung.groupBy({
    by: ["lagerortId"],
    where: { artikelnummer },
    _sum: { menge: true },
  });
  const mitBestand = rows.filter((r) => (r._sum.menge ?? 0) !== 0);
  if (mitBestand.length === 0) return [];
  const orte = await db.lagerort.findMany({
    where: { id: { in: mitBestand.map((r) => r.lagerortId) } },
  });
  const nameMap = new Map(orte.map((o) => [o.id, o.name]));
  return mitBestand
    .map((r) => ({
      lagerortId: r.lagerortId,
      name: nameMap.get(r.lagerortId) ?? "?",
      bestand: r._sum.menge ?? 0,
    }))
    .sort((a, b) => b.bestand - a.bestand);
}

/** Fester Lagerplatz eines Artikels als Adresse, z. B. "A-2-3-1"; null wenn ungepflegt. */
export function lagerplatzCode(a: {
  lagerplatzReihe?: string | null;
  lagerplatzRegal?: string | null;
  lagerplatzFach?: string | null;
  lagerplatzPlatz?: string | null;
}): string | null {
  const teile = [a.lagerplatzReihe, a.lagerplatzRegal, a.lagerplatzFach, a.lagerplatzPlatz]
    .map((t) => (t ?? "").trim())
    .filter((t) => t !== "");
  return teile.length > 0 ? teile.join("-") : null;
}
