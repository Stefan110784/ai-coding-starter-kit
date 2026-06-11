/**
 * Statusampel je Auftrag (Anforderung Kap. 2: „Statusampel pro Auftrag,
 * einsehbar für Vertrieb und Geschäftsführung"). Rein abgeleitet aus
 * vorhandenen Feldern — bewusst ohne Prisma-Import, damit sie sowohl
 * serverseitig (Dashboard-API) als auch im Client nutzbar ist.
 * Später Datenquelle für den CAS-Rückkanal (KF3-39).
 */

export type AmpelFarbe = "rot" | "gelb" | "gruen" | "grau";

export interface AmpelInput {
  status: string;
  promisedDate?: Date | string | null;
  stalledMissingParts?: boolean;
  reworkRequired?: boolean;
}

export interface AmpelErgebnis {
  farbe: AmpelFarbe;
  grund: string;
}

/** Vorwarnzeit: Termin in ≤ 3 Tagen → gelb. */
const VORWARN_TAGE = 3;

/** Datum in Europe/Berlin als "YYYY-MM-DD" (vgl. lokalDatum in auswertung.ts). */
function tagBerlin(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

export function statusampel(a: AmpelInput, heute: Date = new Date()): AmpelErgebnis {
  if (a.status === "abgeschlossen") return { farbe: "grau", grund: "Abgeschlossen" };

  if (a.stalledMissingParts) return { farbe: "rot", grund: "Fehlteile" };

  const termin = a.promisedDate ? new Date(a.promisedDate) : null;
  if (termin && !isNaN(termin.getTime())) {
    const terminTag = tagBerlin(termin);
    const heuteTag = tagBerlin(heute);
    if (terminTag < heuteTag) return { farbe: "rot", grund: "Zugesagter Termin überschritten" };
    const vorwarnTag = tagBerlin(new Date(heute.getTime() + VORWARN_TAGE * 86400000));
    if (terminTag <= vorwarnTag) return { farbe: "gelb", grund: `Termin in ≤ ${VORWARN_TAGE} Tagen` };
  }

  if (a.reworkRequired) return { farbe: "gelb", grund: "Nacharbeit offen" };
  if (a.status === "pausiert") return { farbe: "gelb", grund: "Pausiert" };

  return { farbe: "gruen", grund: "Im Plan" };
}
