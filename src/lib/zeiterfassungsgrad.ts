/**
 * Zeiterfassungsgrad (Anforderung Kap. 4; KF3-35) — Prozess-KPI, keine
 * Leistungskennzahl: Team-Auftragszeit / Team-Soll-Anwesenheit, NUR je Monat,
 * NIE pro Person. Die Funktionen geben strukturell nur Teamsummen zurück;
 * das Soll (ZeitSollMonat) hat keinen Mitarbeiter-FK.
 *
 * Zielkorridor 70–85 %: darunter Datenqualität/Gemeinkosten prüfen, darüber
 * unplausibel. Werte >100 % (Nachträge/Korrekturen) werden angezeigt, nicht
 * gekappt — ehrliches Datenqualitätssignal.
 */
import type { Db } from "@/lib/bestand";
import { anteiligeDauer, type Buchung } from "@/lib/zeit";
import { lokalDatum } from "@/lib/auswertung";

export type GradStatus = "imKorridor" | "zuNiedrig" | "zuHoch" | "keinSoll" | "keineZeiten";

export interface Zeiterfassungsgrad {
  monat: string;
  sollStunden: number | null;
  istStunden: number;
  gradProzent: number | null;
  status: GradStatus;
}

const KORRIDOR_MIN = 70;
const KORRIDOR_MAX = 85;

/** Buchung im Monat? Zuordnung über den Start-Tag (Europe/Berlin, wie mitarbeiterReport). */
function imMonat(start: Date | null, monat: string): boolean {
  return start !== null && lokalDatum(start).slice(0, 7) === monat;
}

/**
 * Team-Auftragssekunden eines Monats — reine Funktion. Buchungen ohne
 * auftragsbezogene Kategorie müssen vorab ausgefiltert sein (Loader).
 * Gibt NUR die Teamsumme zurück (keine Personenwerte).
 */
export function teamAuftragsSekundenImMonat(
  buchungen: Buchung[],
  monat: string,
  now: Date
): number {
  const relevante = buchungen.filter((b) => imMonat(b.start, monat));
  const jeMitarbeiter = new Map<string, Buchung[]>();
  for (const b of relevante) {
    if (b.istKorrektur) continue;
    const liste = jeMitarbeiter.get(b.mitarbeiterId) ?? [];
    liste.push(b);
    jeMitarbeiter.set(b.mitarbeiterId, liste);
  }

  let summe = 0;
  for (const liste of jeMitarbeiter.values()) {
    for (const sekunden of anteiligeDauer(liste, now).values()) {
      summe += sekunden;
    }
  }
  // Korrekturen (±Minuten) wie gebuchteZeitJeAuftrag separat addieren
  for (const b of relevante) {
    if (b.istKorrektur && b.korrekturMinuten != null) {
      summe += b.korrekturMinuten * 60;
    }
  }
  return Math.max(0, summe);
}

/** Grad + Korridor-Einordnung; null-Soll → keinSoll (kein stiller Fallback). */
export function berechneZeiterfassungsgrad(
  monat: string,
  istSekunden: number,
  sollStunden: number | null
): Zeiterfassungsgrad {
  const istStunden = Math.round((istSekunden / 3600) * 10) / 10;
  if (sollStunden === null || sollStunden <= 0) {
    return { monat, sollStunden: null, istStunden, gradProzent: null, status: "keinSoll" };
  }
  if (istSekunden === 0) {
    return { monat, sollStunden, istStunden: 0, gradProzent: 0, status: "keineZeiten" };
  }
  const grad = Math.round((istSekunden / 3600 / sollStunden) * 1000) / 10;
  const status: GradStatus =
    grad < KORRIDOR_MIN ? "zuNiedrig" : grad > KORRIDOR_MAX ? "zuHoch" : "imKorridor";
  return { monat, sollStunden, istStunden, gradProzent: grad, status };
}

/**
 * Soll-Vorschlag: Σ Wochenstunden/5 × Mo–Fr-Tage des Monats — bewusst
 * feiertagsblind (der Dialog weist darauf hin; Abzüge pflegt der Mensch).
 */
export function sollVorschlag(wochenstundenListe: number[], monat: string): number | null {
  const summe = wochenstundenListe.reduce((s, w) => s + w, 0);
  if (summe <= 0) return null;
  const [jahr, m] = monat.split("-").map(Number);
  let werktage = 0;
  for (let tag = 1; tag <= new Date(Date.UTC(jahr, m, 0)).getUTCDate(); tag++) {
    const wt = new Date(Date.UTC(jahr, m - 1, tag)).getUTCDay();
    if (wt >= 1 && wt <= 5) werktage++;
  }
  return Math.round((summe / 5) * werktage * 10) / 10;
}

/** Loader: Grad für einen Monat (lädt nur auftragsbezogene Buchungen). */
export async function zeiterfassungsgradFuerMonat(
  db: Db,
  monat: string,
  now: Date = new Date()
): Promise<Zeiterfassungsgrad> {
  const [buchungen, soll] = await Promise.all([
    db.auftragszeit.findMany({
      where: {
        OR: [{ kategorieId: null }, { kategorie: { auftragsbezogen: true } }],
      },
      select: {
        id: true,
        mitarbeiterId: true,
        auftragId: true,
        start: true,
        ende: true,
        istNachtrag: true,
        istKorrektur: true,
        korrekturMinuten: true,
      },
    }),
    db.zeitSollMonat.findUnique({ where: { monat } }),
  ]);
  const ist = teamAuftragsSekundenImMonat(buchungen, monat, now);
  return berechneZeiterfassungsgrad(monat, ist, soll?.sollStunden ?? null);
}
