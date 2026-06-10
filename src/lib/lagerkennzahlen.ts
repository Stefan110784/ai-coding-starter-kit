/**
 * Lagerkennzahlen nach BWL II (Lektion 2, Lagerhaltung):
 * - durchschnittlicher Lagerbestand = (Anfangsbestand + Endbestand) / 2
 * - Lagerumschlagshäufigkeit       = Jahresverbrauch / Ø-Lagerbestand
 * - durchschnittliche Lagerdauer    = 365 / Umschlagshäufigkeit
 *
 * Mengenbasiert: Bestände/Verbräuche sind Summen über alle Artikel
 * (`Materialbewegung.menge` ist vorzeichenbehaftet). Eine wertbasierte
 * Auswertung (Preis × Menge) folgt mit der Materialbewertung.
 */
import { bestandJeArtikel, type Db } from "@/lib/bestand";

const TAGE_PRO_JAHR = 365;

export interface Lagerkennzahlen {
  /** Verbrauch im Zeitraum auf 1 Jahr hochgerechnet (Stück/Jahr). */
  jahresverbrauch: number;
  /** (Anfangsbestand + Endbestand) / 2. */
  durchschnittsbestand: number;
  /** Jahresverbrauch / Ø-Bestand; null bei Ø-Bestand 0. */
  umschlagshaeufigkeit: number | null;
  /** 365 / Umschlagshäufigkeit (Tage); null bei Umschlag 0. */
  lagerdauerTage: number | null;
  /** Anzahl Artikel mit aktuellem Bestand ≠ 0 (Aussagekraft-Indikator). */
  artikelMitBestand: number;
}

/** Reine Berechnung (testbar, ohne DB). */
export function berechneLagerkennzahlen(input: {
  anfangsbestand: number;
  endbestand: number;
  /** Verbrauchsmenge im Zeitraum als positive Zahl. */
  verbrauchImZeitraum: number;
  zeitraumTage: number;
}): Omit<Lagerkennzahlen, "artikelMitBestand"> {
  const durchschnitt = (input.anfangsbestand + input.endbestand) / 2;
  const jahresverbrauch =
    input.zeitraumTage > 0
      ? (input.verbrauchImZeitraum / input.zeitraumTage) * TAGE_PRO_JAHR
      : 0;
  const umschlag = durchschnitt > 0 ? jahresverbrauch / durchschnitt : null;
  const lagerdauer = umschlag && umschlag > 0 ? TAGE_PRO_JAHR / umschlag : null;

  return {
    jahresverbrauch: Math.round(jahresverbrauch * 10) / 10,
    durchschnittsbestand: Math.round(durchschnitt * 10) / 10,
    umschlagshaeufigkeit: umschlag != null ? Math.round(umschlag * 100) / 100 : null,
    lagerdauerTage: lagerdauer != null ? Math.round(lagerdauer) : null,
  };
}

/** Kennzahlen aus den Materialbewegungen für den Zeitraum [von, bis] ermitteln. */
export async function lagerKennzahlenAusDb(
  db: Db,
  von: Date,
  bis: Date
): Promise<Lagerkennzahlen> {
  const [endAgg, anfangAgg, verbrauchAgg, bestand] = await Promise.all([
    // Endbestand: Summe aller Bewegungen bis einschließlich `bis`.
    db.materialbewegung.aggregate({ where: { gebuchtAm: { lte: bis } }, _sum: { menge: true } }),
    // Anfangsbestand: Summe aller Bewegungen vor `von`.
    db.materialbewegung.aggregate({ where: { gebuchtAm: { lt: von } }, _sum: { menge: true } }),
    // Verbrauch im Zeitraum: Entnahmen und Fertigmeldungen (negativ → Betrag).
    db.materialbewegung.aggregate({
      where: { gebuchtAm: { gte: von, lte: bis }, art: { in: ["entnahme", "fertigmeldung"] } },
      _sum: { menge: true },
    }),
    bestandJeArtikel(db),
  ]);

  let artikelMitBestand = 0;
  for (const v of bestand.values()) if (v !== 0) artikelMitBestand++;

  const zeitraumTage = Math.max(1, Math.round((bis.getTime() - von.getTime()) / 86400000));
  const kern = berechneLagerkennzahlen({
    anfangsbestand: anfangAgg._sum.menge ?? 0,
    endbestand: endAgg._sum.menge ?? 0,
    verbrauchImZeitraum: Math.abs(verbrauchAgg._sum.menge ?? 0),
    zeitraumTage,
  });

  return { ...kern, artikelMitBestand };
}
