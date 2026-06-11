/**
 * Auswertungs- und KPI-Logik — Port von V2 services/auswertung.py +
 * api/auswertung.py (Reports, KPI je ISO-Woche).
 */
import { prisma } from "@/lib/prisma";
import { gebuchteZeitJeAuftrag, anteiligeDauer, type Buchung } from "@/lib/zeit";
import { montagVonIsoWoche, sonntagVonIsoWoche } from "@/lib/isowoche";
import type { Auftrag } from "@/generated/prisma";

/** Datum eines Zeitstempels in Europe/Berlin als "YYYY-MM-DD" (V2: lokale date()). */
export function lokalDatum(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/** Flache Soll-Zeit: Σ Menge × Vorgabezeit (Minuten) × 60; null ohne Vorgaben. */
export function sollSekundenFlach(
  positionen: Array<{ artikelnummer: string | null; menge: number | null }>,
  vorgabezeitMap: Map<string, number>
): number | null {
  let summe = 0;
  let hatVorgabe = false;
  for (const p of positionen) {
    const vz = p.artikelnummer ? vorgabezeitMap.get(p.artikelnummer) : undefined;
    if (vz) {
      summe += (p.menge ?? 0) * vz;
      hatVorgabe = true;
    }
  }
  return hatVorgabe ? summe * 60 : null;
}

async function vzMap(): Promise<Map<string, number>> {
  const artikel = await prisma.artikel.findMany({
    where: { vorgabezeit: { not: null } },
    select: { artikelnummer: true, vorgabezeit: true },
  });
  return new Map(artikel.map((a) => [a.artikelnummer, a.vorgabezeit as number]));
}

async function alleBuchungen(): Promise<Buchung[]> {
  const zeiten = await prisma.auftragszeit.findMany();
  return zeiten.map((z) => ({
    id: z.id,
    mitarbeiterId: z.mitarbeiterId,
    auftragId: z.auftragId,
    start: z.start,
    ende: z.ende,
    istNachtrag: z.istNachtrag,
    istKorrektur: z.istKorrektur,
    korrekturMinuten: z.korrekturMinuten,
  }));
}

// ── Reports ──────────────────────────────────────────────────────────

export interface AuftragReportZeile {
  nummer: string;
  bezeichnung: string;
  status: string;
  ist_sekunden: number;
  soll_sekunden: number | null;
  diff_sekunden: number | null;
}

export async function auftragReport(): Promise<AuftragReportZeile[]> {
  const [auftraege, buchungen, vz] = await Promise.all([
    prisma.auftrag.findMany({ include: { positionen: true }, orderBy: { nummer: "asc" } }),
    alleBuchungen(),
    vzMap(),
  ]);
  const ist = gebuchteZeitJeAuftrag(buchungen, new Date());

  return auftraege.map((a) => {
    // Eingefrorene (stücklisten-/lagerabhängige) Soll-Zeit bevorzugen, sonst flach.
    const soll = a.planZeitSekunden ?? sollSekundenFlach(a.positionen, vz);
    const i = ist.get(a.id) ?? 0;
    return {
      nummer: a.nummer,
      bezeichnung: a.bezeichnung,
      status: a.status,
      ist_sekunden: Math.round(i),
      soll_sekunden: soll != null ? Math.round(soll) : null,
      diff_sekunden: soll != null ? Math.round(i - soll) : null,
    };
  });
}

export interface MitarbeiterReportZeile {
  mitarbeiter: string;
  sekunden: number;
  buchungen: number;
}

export async function mitarbeiterReport(
  von?: string | null,
  bis?: string | null
): Promise<MitarbeiterReportZeile[]> {
  const [mitarbeiter, buchungen] = await Promise.all([
    prisma.mitarbeiter.findMany(),
    alleBuchungen(),
  ]);
  const namen = new Map(mitarbeiter.map((m) => [m.id, m.name]));
  const now = new Date();

  const proMa = new Map<string, Buchung[]>();
  for (const b of buchungen) {
    const liste = proMa.get(b.mitarbeiterId) ?? [];
    liste.push(b);
    proMa.set(b.mitarbeiterId, liste);
  }

  const rows: MitarbeiterReportZeile[] = [];
  for (const [maId, maBuchungen] of proMa) {
    const anteil = anteiligeDauer(maBuchungen, now);
    let total = 0;
    let anzahl = 0;
    for (const b of maBuchungen) {
      if (b.start === null) continue;
      const tag = lokalDatum(b.start);
      if (von && tag < von) continue;
      if (bis && tag > bis) continue;
      total += anteil.get(b.id) ?? 0;
      anzahl += 1;
    }
    if (anzahl > 0) {
      rows.push({ mitarbeiter: namen.get(maId) ?? "—", sekunden: Math.round(total), buchungen: anzahl });
    }
  }
  rows.sort((a, b) => b.sekunden - a.sekunden);
  return rows;
}

export interface QualitaetReportZeile {
  auftrag: string;
  gut: number;
  ausschuss: number;
  nacharbeit: number;
  ausschussquote: number;
}

export async function qualitaetReport(): Promise<QualitaetReportZeile[]> {
  const [auftraege, qualitaet] = await Promise.all([
    prisma.auftrag.findMany({ select: { id: true, nummer: true } }),
    prisma.qualitaet.findMany(),
  ]);
  const nummer = new Map(auftraege.map((a) => [a.id, a.nummer]));

  const agg = new Map<string, { gut: number; ausschuss: number; nacharbeit: number }>();
  for (const q of qualitaet) {
    const d = agg.get(q.auftragId) ?? { gut: 0, ausschuss: 0, nacharbeit: 0 };
    d.gut += q.gut;
    d.ausschuss += q.ausschuss;
    d.nacharbeit += q.nacharbeit;
    agg.set(q.auftragId, d);
  }

  const rows: QualitaetReportZeile[] = [];
  for (const [aid, d] of agg) {
    const ges = d.gut + d.ausschuss + d.nacharbeit;
    rows.push({
      auftrag: nummer.get(aid) ?? "—",
      ...d,
      ausschussquote: ges > 0 ? Math.round((d.ausschuss / ges) * 1000) / 10 : 0,
    });
  }
  rows.sort((a, b) => a.auftrag.localeCompare(b.auftrag));
  return rows;
}

// ── KPI ──────────────────────────────────────────────────────────────

export interface Kpi {
  basis: number;
  onTimeDeliveryRate: number | null;
  reworkRate: number | null;
  missingPartsRate: number | null;
  avgStallDays: number | null;
  leadTimeDaysMedian: number | null;
  leadTimeDaysAvg: number | null;
}

function rund1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Alle 4 KPIs für eine Liste abgeschlossener Aufträge (V2: _kpi_fuer_zeitraum). */
export function kpiFuerZeitraum(auftraege: Auftrag[]): Kpi {
  const abgeschlossen = auftraege.filter((a) => a.ende !== null);
  const basis = abgeschlossen.length;

  if (basis === 0) {
    return {
      basis: 0,
      onTimeDeliveryRate: null,
      reworkRate: null,
      missingPartsRate: null,
      avgStallDays: null,
      leadTimeDaysMedian: null,
      leadTimeDaysAvg: null,
    };
  }

  // 1. Liefertreue — nur über Aufträge mit zugesagtem Termin.
  // Beide Seiten in Europe/Berlin vergleichen (vormals ende=lokal vs. promised=UTC,
  // was an Tagesgrenzen zu einem Tag Abweichung führen konnte).
  const mitTermin = abgeschlossen.filter((a) => a.promisedDate !== null);
  const onTime = mitTermin.filter(
    (a) => lokalDatum(a.ende as Date) <= lokalDatum(a.promisedDate as Date)
  ).length;
  const liefertreue = mitTermin.length > 0 ? rund1((onTime / mitTermin.length) * 100) : null;

  // 2. Nacharbeitsquote
  const reworkCnt = abgeschlossen.filter((a) => a.reworkRequired).length;
  const reworkRate = rund1((reworkCnt / basis) * 100);

  // 3. Fehlteilquote
  const stalledCnt = abgeschlossen.filter((a) => a.stalledMissingParts).length;
  const missingRate = rund1((stalledCnt / basis) * 100);
  const stallTage = abgeschlossen
    .filter((a) => a.stalledMissingParts && a.stallDays !== null)
    .map((a) => a.stallDays as number);
  const avgStall = stallTage.length > 0 ? rund1(stallTage.reduce((s, t) => s + t, 0) / stallTage.length) : null;

  // 4. Durchlaufzeit (Tage zwischen Start- und Ende-Datum)
  const durchlaufzeiten: number[] = [];
  for (const a of abgeschlossen) {
    if (a.start !== null) {
      const tage = Math.round(
        (Date.parse(lokalDatum(a.ende as Date)) - Date.parse(lokalDatum(a.start))) / 86400000
      );
      if (tage >= 0) durchlaufzeiten.push(tage);
    }
  }
  let median: number | null = null;
  let avg: number | null = null;
  if (durchlaufzeiten.length > 0) {
    const sortiert = [...durchlaufzeiten].sort((x, y) => x - y);
    const mitte = Math.floor(sortiert.length / 2);
    median = rund1(
      sortiert.length % 2 === 1 ? sortiert[mitte] : (sortiert[mitte - 1] + sortiert[mitte]) / 2
    );
    avg = rund1(durchlaufzeiten.reduce((s, t) => s + t, 0) / durchlaufzeiten.length);
  }

  return {
    basis,
    onTimeDeliveryRate: liefertreue,
    reworkRate,
    missingPartsRate: missingRate,
    avgStallDays: avgStall,
    leadTimeDaysMedian: median,
    leadTimeDaysAvg: avg,
  };
}

/** KPI-relevante Aufträge, die in der ISO-Woche abgeschlossen wurden (kpiAusgeschlossen=false). */
export async function auftraegeInWoche(jahr: number, woche: number): Promise<Auftrag[]> {
  // Wochengrenzen wie das Auftragsdatum in Europe/Berlin bilden (konsistente Zeitzone).
  const montag = lokalDatum(montagVonIsoWoche(jahr, woche));
  const sonntag = lokalDatum(sonntagVonIsoWoche(jahr, woche));
  const alle = await prisma.auftrag.findMany({
    where: { ende: { not: null }, kpiAusgeschlossen: false },
  });
  return alle.filter((a) => {
    const tag = lokalDatum(a.ende as Date);
    return montag <= tag && tag <= sonntag;
  });
}

// ── Ende-zu-Ende-Liefertreue (Kundenaufträge, KF3-37) ────────────────

export interface KundenLiefertreue {
  /** Gelieferte Kundenaufträge mit Wunschtermin in der Woche. */
  basis: number;
  prozent: number | null;
}

/**
 * Reine Logik: pünktlich = geliefert am/vor dem Kundenwunschtermin
 * (Tagesvergleich Europe/Berlin). Misst bewusst gegen den WUNSCH-, nicht den
 * bestätigten Termin — der bestätigte ist das Rückkanal-Feld (KF3-39).
 */
export function berechneKundenLiefertreue(
  auftraege: Array<{ wunschtermin: Date | null; geliefertAm: Date | null }>
): KundenLiefertreue {
  const messbar = auftraege.filter((k) => k.wunschtermin !== null && k.geliefertAm !== null);
  if (messbar.length === 0) return { basis: 0, prozent: null };
  const puenktlich = messbar.filter(
    (k) => lokalDatum(k.geliefertAm as Date) <= lokalDatum(k.wunschtermin as Date)
  ).length;
  return { basis: messbar.length, prozent: rund1((puenktlich / messbar.length) * 100) };
}

/** Kundenaufträge mit Lieferung in der ISO-Woche (Berlin-Tagesgrenzen). */
export async function kundenLiefertreueInWoche(
  jahr: number,
  woche: number
): Promise<KundenLiefertreue> {
  const montag = lokalDatum(montagVonIsoWoche(jahr, woche));
  const sonntag = lokalDatum(sonntagVonIsoWoche(jahr, woche));
  const geliefert = await prisma.kundenauftrag.findMany({
    where: { status: "geliefert", aktiv: true, geliefertAm: { not: null } },
    select: { wunschtermin: true, geliefertAm: true },
  });
  return berechneKundenLiefertreue(
    geliefert.filter((k) => {
      const tag = lokalDatum(k.geliefertAm as Date);
      return montag <= tag && tag <= sonntag;
    })
  );
}
