/**
 * Bestellwesen-Logik (Anforderung Kap. 3; KF3-29/30).
 *
 * Konvention wie src/lib/bestand.ts: Die gelieferte Menge wird NICHT
 * denormalisiert, sondern aus den Materialbewegungen je Bestellposition
 * summiert — der Buchungs-Audit-Trail ist die einzige Wahrheit. Persistiert
 * wird nur der Bestellstatus (Zustandsmaschine), gesetzt in derselben
 * Transaktion wie die Wareneingangs-Buchung.
 */
import type { Db } from "@/lib/bestand";

export type AmpelStufe = "rot" | "gelb" | "gruen";

/**
 * Toleranz für Float-Mengenvergleiche: Materialbewegung.menge ist Float —
 * Teillieferungen wie 0.1 + 0.2 dürfen weder eine falsche Überlieferung
 * melden noch den Status auf teilgeliefert hängen lassen.
 */
export const MENGEN_EPS = 1e-9;

/** Tage Vorwarnung, bevor ein zugesagter Termin als kritisch (gelb) gilt. */
const VORWARN_TAGE = 3;

function tagBerlin(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/** Kalendertag-Addition im Datumsraum — DST-sicher. */
function plusTageBerlin(d: Date, tage: number): string {
  const [jahr, monat, tag] = tagBerlin(d).split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, tag + tage)).toISOString().slice(0, 10);
}

/** Effektiver zugesagter Termin einer Position: Positions-Override vor Kopf. */
export function effektiverTermin(
  position: { zugesagtTermin?: Date | null },
  kopf: { zugesagtTermin?: Date | null }
): Date | null {
  return position.zugesagtTermin ?? kopf.zugesagtTermin ?? null;
}

/**
 * Überfälligkeits-Ampel einer offenen Position: rot = Termin überschritten,
 * gelb = Termin in ≤ 3 Tagen, grün = sonst (auch ohne Termin).
 */
export function terminAmpel(
  termin: Date | null,
  restmenge: number,
  heute: Date = new Date()
): AmpelStufe {
  if (!termin || restmenge <= 0) return "gruen";
  const terminTag = tagBerlin(termin);
  const heuteTag = tagBerlin(heute);
  if (terminTag < heuteTag) return "rot";
  if (terminTag <= plusTageBerlin(heute, VORWARN_TAGE)) return "gelb";
  return "gruen";
}

/**
 * Folgestatus nach einer Wareneingangs-Buchung: abgeschlossen, wenn alle
 * Positionen voll geliefert sind, sonst teilgeliefert.
 */
export function statusNachWareneingang(
  positionen: Array<{ menge: number; geliefert: number }>
): "teilgeliefert" | "abgeschlossen" {
  const alleVoll = positionen.every((p) => p.geliefert >= p.menge - MENGEN_EPS);
  return alleVoll ? "abgeschlossen" : "teilgeliefert";
}

/** Gelieferte Menge je Bestellposition (Summe der Wareneingangs-Bewegungen). */
export async function gelieferteMengen(
  db: Db,
  bestellPositionIds: string[]
): Promise<Map<string, number>> {
  if (bestellPositionIds.length === 0) return new Map();
  const rows = await db.materialbewegung.groupBy({
    by: ["bestellPositionId"],
    where: { bestellPositionId: { in: bestellPositionIds } },
    _sum: { menge: true },
  });
  return new Map(
    rows
      .filter((r) => r.bestellPositionId !== null)
      .map((r) => [r.bestellPositionId as string, r._sum.menge ?? 0])
  );
}

/**
 * Offen bestellte Menge je Artikel über alle aktiven Bestellungen
 * (bestellt + teilgeliefert + angefragt), abzüglich bereits gelieferter
 * Mengen — Input für die Bestellvorschläge ("verfügbar = Bestand + bestellt").
 */
export async function offeneBestellmengeJeArtikel(db: Db): Promise<Map<string, number>> {
  const positionen = await db.bestellPosition.findMany({
    where: { bestellung: { status: { in: ["angefragt", "bestellt", "teilgeliefert"] } } },
    select: { id: true, artikelnummer: true, menge: true },
  });
  const geliefert = await gelieferteMengen(
    db,
    positionen.map((p) => p.id)
  );
  const offen = new Map<string, number>();
  for (const p of positionen) {
    const rest = Math.max(0, p.menge - (geliefert.get(p.id) ?? 0));
    if (rest > MENGEN_EPS) offen.set(p.artikelnummer, (offen.get(p.artikelnummer) ?? 0) + rest);
  }
  return offen;
}
