/**
 * Lieferantenbewertung (Anforderung Kap. 3, ISO 8.4; KF3-32):
 * automatisch aus Termintreue (Wareneingang vs. zugesagter Termin) und
 * Qualität (Eingangsprüfungen) — keine separate Excel-Pflege. Rein abgeleitet,
 * kein eigenes Schema.
 */
import type { Db } from "@/lib/bestand";
import { effektiverTermin } from "@/lib/bestellung";

export interface BewertungsPosition {
  menge: number;
  termin: Date | null;
  lieferungen: Array<{ menge: number; gebuchtAm: Date }>;
}

export interface Bewertung {
  /** Voll gelieferte Positionen mit Termin (Basis der Termintreue). */
  termintreueBasis: number;
  termintreueProzent: number | null;
  /** Anzahl Eingangsprüfungen (Basis der Qualität). */
  qualitaetBasis: number;
  qualitaetProzent: number | null;
}

function tagBerlin(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/**
 * Reine Bewertungslogik: Eine Position zählt zur Termintreue, sobald sie voll
 * geliefert ist und einen Termin hat; pünktlich = letzte vervollständigende
 * Lieferung am oder vor dem Termin (Tagesvergleich Europe/Berlin).
 */
export function berechneBewertung(
  positionen: BewertungsPosition[],
  pruefErgebnisse: string[]
): Bewertung {
  let basis = 0;
  let puenktlich = 0;
  for (const p of positionen) {
    if (!p.termin || p.lieferungen.length === 0) continue;
    const geliefert = p.lieferungen.reduce((s, l) => s + l.menge, 0);
    if (geliefert < p.menge) continue;
    basis++;
    const letzte = p.lieferungen.reduce(
      (max, l) => (l.gebuchtAm > max ? l.gebuchtAm : max),
      p.lieferungen[0].gebuchtAm
    );
    if (tagBerlin(letzte) <= tagBerlin(p.termin)) puenktlich++;
  }

  const okAnzahl = pruefErgebnisse.filter((e) => e === "ok").length;

  return {
    termintreueBasis: basis,
    termintreueProzent: basis > 0 ? Math.round((puenktlich / basis) * 1000) / 10 : null,
    qualitaetBasis: pruefErgebnisse.length,
    qualitaetProzent:
      pruefErgebnisse.length > 0
        ? Math.round((okAnzahl / pruefErgebnisse.length) * 1000) / 10
        : null,
  };
}

export interface LieferantBewertung extends Bewertung {
  lieferantId: string;
  name: string;
}

/** Bewertung je aktivem Lieferanten aus Bestellungen, Wareneingängen und Prüfungen. */
export async function bewertungJeLieferant(db: Db): Promise<LieferantBewertung[]> {
  const lieferanten = await db.lieferant.findMany({
    where: { aktiv: true },
    select: {
      id: true,
      name: true,
      bestellungen: {
        where: { status: { not: "storniert" } },
        select: {
          zugesagtTermin: true,
          positionen: {
            select: {
              menge: true,
              zugesagtTermin: true,
              bewegungen: {
                select: {
                  menge: true,
                  gebuchtAm: true,
                  pruefung: { select: { ergebnis: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return lieferanten.map((l) => {
    const positionen: BewertungsPosition[] = [];
    const pruefErgebnisse: string[] = [];
    for (const b of l.bestellungen) {
      for (const p of b.positionen) {
        positionen.push({
          menge: p.menge,
          termin: effektiverTermin(p, b),
          lieferungen: p.bewegungen.map((m) => ({ menge: m.menge, gebuchtAm: m.gebuchtAm })),
        });
        for (const m of p.bewegungen) {
          if (m.pruefung) pruefErgebnisse.push(m.pruefung.ergebnis);
        }
      }
    }
    return { lieferantId: l.id, name: l.name, ...berechneBewertung(positionen, pruefErgebnisse) };
  });
}
