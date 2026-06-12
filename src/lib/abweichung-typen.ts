/**
 * Zentrale Typ-Whitelist für Abweichungen (KF3-27/34/36) — EINE Quelle statt
 * verstreuter Literale (bekanntes Tippfehler-Risiko aus dem KF3-34-Review).
 */
export const ABWEICHUNG_TYPEN = [
  "nacharbeit",
  "ausschuss",
  "reklamationKunde",
  "reklamationLieferant",
  "fuenfs",
] as const;

export type AbweichungTypWert = (typeof ABWEICHUNG_TYPEN)[number];

export const ABWEICHUNG_TYP_LABEL: Record<AbweichungTypWert, string> = {
  nacharbeit: "Nacharbeit",
  ausschuss: "Ausschuss",
  reklamationKunde: "Reklamation Kunde",
  reklamationLieferant: "Reklamation Lieferant",
  fuenfs: "5S-Maßnahme",
};
