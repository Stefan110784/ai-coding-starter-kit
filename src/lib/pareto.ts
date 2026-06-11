/**
 * Pareto-Aggregation (Anforderung Kap. 2; KF3-34): Welche Verursacher decken
 * 80 % der Fälle? Reine Rechenlogik — die Routen liefern nur die Zählung.
 */

export interface ParetoPosition {
  key: string;
  label: string;
  anzahl: number;
  /** Anteil an der Gesamtzahl in Prozent (1 Nachkommastelle). */
  prozent: number;
  /** Kumulierter Anteil bis einschließlich dieser Position. */
  kumProzent: number;
}

export interface ParetoErgebnis {
  gesamt: number;
  positionen: ParetoPosition[];
  /** Zusammengefasste Fälle jenseits der Top-N. */
  sonstigeAnzahl: number;
}

/**
 * Zählung → absteigend sortierte Pareto-Liste mit kumulierten Prozenten.
 * Bei Gleichstand alphabetisch (stabil für Tests und UI).
 */
export function paretoBerechnen(
  zaehlung: Array<{ key: string; label: string; anzahl: number }>,
  limit = 20
): ParetoErgebnis {
  const gesamt = zaehlung.reduce((s, z) => s + z.anzahl, 0);
  const sortiert = [...zaehlung]
    .filter((z) => z.anzahl > 0)
    .sort((a, b) => b.anzahl - a.anzahl || a.label.localeCompare(b.label, "de"));

  const top = sortiert.slice(0, limit);
  const sonstigeAnzahl = sortiert.slice(limit).reduce((s, z) => s + z.anzahl, 0);

  let kum = 0;
  const positionen: ParetoPosition[] = top.map((z) => {
    kum += z.anzahl;
    return {
      key: z.key,
      label: z.label,
      anzahl: z.anzahl,
      prozent: gesamt > 0 ? Math.round((z.anzahl / gesamt) * 1000) / 10 : 0,
      kumProzent: gesamt > 0 ? Math.round((kum / gesamt) * 1000) / 10 : 0,
    };
  });

  return { gesamt, positionen, sonstigeAnzahl };
}
