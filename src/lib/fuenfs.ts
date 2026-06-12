/** 5S-Audit-Logik (Anforderung Kap. 5; KF3-36) — reine Funktionen. */

export interface ScorePosition {
  punkte: number | null; // 0 | 1 | 2
  nichtAnwendbar: boolean;
}

/**
 * Score = erreichte Punkte / (2 × bewertete Punkte) × 100; n. a. zählt nicht.
 * null, wenn keine Position bewertet ist.
 */
export function scoreProzent(positionen: ScorePosition[]): number | null {
  const bewertet = positionen.filter((p) => !p.nichtAnwendbar && p.punkte !== null);
  if (bewertet.length === 0) return null;
  const erreicht = bewertet.reduce((s, p) => s + (p.punkte as number), 0);
  return Math.round((erreicht / (bewertet.length * 2)) * 1000) / 10;
}

/** Abschluss-Validierung: jede Position bewertet ODER n. a., mindestens 1 bewertet. */
export function abschlussFehler(positionen: ScorePosition[]): string | null {
  const offen = positionen.filter((p) => !p.nichtAnwendbar && p.punkte === null).length;
  if (offen > 0) return `${offen} Punkt${offen === 1 ? "" : "e"} noch nicht bewertet`;
  if (positionen.every((p) => p.nichtAnwendbar)) return "Mindestens ein Punkt muss bewertet sein";
  return null;
}

export const FUENFS_KATEGORIE_LABEL: Record<string, string> = {
  seiri: "Seiri · Sortieren",
  seiton: "Seiton · Systematisieren",
  seiso: "Seiso · Säubern",
  seiketsu: "Seiketsu · Standardisieren",
  shitsuke: "Shitsuke · Selbstdisziplin",
};
