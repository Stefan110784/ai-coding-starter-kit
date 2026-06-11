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
 *
 * Reihenfolge wie mitarbeiterReport (Review-Befund): die anteilige Aufteilung
 * läuft über ALLE übergebenen Buchungen eines Mitarbeiters, der Monatsfilter
 * greift erst beim Summieren — sonst zählt Parallelarbeit über die
 * Monatsgrenze doppelt (Wanduhr-Invariante aus zeit.ts).
 */
export function teamAuftragsSekundenImMonat(
  buchungen: Buchung[],
  monat: string,
  now: Date
): number {
  const jeMitarbeiter = new Map<string, Buchung[]>();
  for (const b of buchungen) {
    if (b.istKorrektur) continue;
    const liste = jeMitarbeiter.get(b.mitarbeiterId) ?? [];
    liste.push(b);
    jeMitarbeiter.set(b.mitarbeiterId, liste);
  }

  let summe = 0;
  for (const liste of jeMitarbeiter.values()) {
    const anteile = anteiligeDauer(liste, now);
    for (const b of liste) {
      if (imMonat(b.start, monat)) summe += anteile.get(b.id) ?? 0;
    }
  }
  // Korrekturen (±Minuten) wie gebuchteZeitJeAuftrag separat addieren
  for (const b of buchungen) {
    if (b.istKorrektur && b.korrekturMinuten != null && imMonat(b.start, monat)) {
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

/**
 * Buchungen eines Monatsfensters laden (nur auftragsbezogene Kategorien).
 * Grober SQL-Range über den Start (±3 Tage Puffer für Nacht-/Berlin-Fälle und
 * die monatsübergreifende Aufteilung) statt Volltabellen-Read (Review-Befund);
 * die exakte Berlin-Tageszuordnung entscheidet in JS.
 */
async function ladeBuchungen(db: Db, vonMonat: string, bisMonat: string): Promise<Buchung[]> {
  const von = new Date(`${vonMonat}-01T00:00:00Z`);
  von.setUTCDate(von.getUTCDate() - 3);
  const [bJahr, bMonat] = bisMonat.split("-").map(Number);
  const bis = new Date(Date.UTC(bJahr, bMonat, 1)); // 1. des Folgemonats
  bis.setUTCDate(bis.getUTCDate() + 3);

  return db.auftragszeit.findMany({
    where: {
      start: { gte: von, lt: bis },
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
  });
}

/** Loader: Grad für einen Monat. */
export async function zeiterfassungsgradFuerMonat(
  db: Db,
  monat: string,
  now: Date = new Date()
): Promise<Zeiterfassungsgrad> {
  const [buchungen, soll] = await Promise.all([
    ladeBuchungen(db, monat, monat),
    db.zeitSollMonat.findUnique({ where: { monat } }),
  ]);
  const ist = teamAuftragsSekundenImMonat(buchungen, monat, now);
  return berechneZeiterfassungsgrad(monat, ist, soll?.sollStunden ?? null);
}

/**
 * Loader: Verlauf über N Monate — EIN Buchungs-Read für das ganze Fenster
 * statt einem je Monat (Review-Befund: vorher bis zu 24 Volltabellen-Reads).
 */
export async function zeiterfassungsgradVerlauf(
  db: Db,
  monate: string[],
  now: Date = new Date()
): Promise<Zeiterfassungsgrad[]> {
  if (monate.length === 0) return [];
  const [buchungen, solls] = await Promise.all([
    ladeBuchungen(db, monate[0], monate[monate.length - 1]),
    db.zeitSollMonat.findMany({ where: { monat: { in: monate } } }),
  ]);
  const sollJeMonat = new Map(solls.map((s) => [s.monat, s.sollStunden]));
  return monate.map((monat) =>
    berechneZeiterfassungsgrad(
      monat,
      teamAuftragsSekundenImMonat(buchungen, monat, now),
      sollJeMonat.get(monat) ?? null
    )
  );
}
