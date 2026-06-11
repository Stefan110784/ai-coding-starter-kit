/**
 * Serverseitige Zeitlogik — Port von V2 services/zeit.py.
 *
 * Anteilige Aufteilung: Arbeitet ein Mitarbeiter gleichzeitig an mehreren
 * Aufträgen, wird seine reale Wanduhr-Zeit fair auf die parallel offenen
 * Buchungen verteilt; die Summe bleibt korrekt.
 *
 * Nachträge (istNachtrag) zählen mit fester voller Dauer und gehen nicht in
 * die Aufteilung ein. Korrekturbuchungen (istKorrektur) addieren ±Minuten.
 */

export interface Buchung {
  id: string;
  mitarbeiterId: string;
  auftragId: string;
  start: Date | null;
  ende: Date | null;
  istNachtrag?: boolean;
  istKorrektur?: boolean;
  korrekturMinuten?: number | null;
}

/** Anteilige Dauer je Buchung (Sekunden) für EINEN Mitarbeiter; laufende bis `now`. */
export function anteiligeDauer(buchungen: Buchung[], now: Date): Map<string, number> {
  const ergebnis = new Map<string, number>();
  const aufteilbar: Array<{ id: string; start: number; ende: number }> = [];

  for (const b of buchungen) {
    const e = b.ende ?? now;
    if (b.start === null || e === null || e.getTime() <= b.start.getTime()) {
      if (!ergebnis.has(b.id)) ergebnis.set(b.id, 0);
      continue;
    }
    if (b.istNachtrag) {
      ergebnis.set(b.id, (ergebnis.get(b.id) ?? 0) + (e.getTime() - b.start.getTime()) / 1000);
    } else {
      if (!ergebnis.has(b.id)) ergebnis.set(b.id, 0);
      aufteilbar.push({ id: b.id, start: b.start.getTime(), ende: e.getTime() });
    }
  }

  const grenzen = [...new Set(aufteilbar.flatMap((a) => [a.start, a.ende]))].sort((x, y) => x - y);
  for (let i = 0; i < grenzen.length - 1; i++) {
    const t0 = grenzen[i];
    const t1 = grenzen[i + 1];
    const dauer = (t1 - t0) / 1000;
    if (dauer <= 0) continue;
    const aktive = aufteilbar.filter((a) => a.start <= t0 && a.ende >= t1).map((a) => a.id);
    if (aktive.length === 0) continue;
    const anteil = dauer / aktive.length;
    for (const id of aktive) ergebnis.set(id, (ergebnis.get(id) ?? 0) + anteil);
  }

  return ergebnis;
}

/**
 * Anteilige Gesamtzeit je Auftrag über alle Mitarbeiter (Sekunden).
 * Aufteilung pro Mitarbeiter, dann je Auftrag summiert; Korrekturen ±Minuten.
 */
export function gebuchteZeitJeAuftrag(buchungen: Buchung[], now: Date): Map<string, number> {
  const nachMitarbeiter = new Map<string, Buchung[]>();
  const korrekturen: Buchung[] = [];
  for (const b of buchungen) {
    if (b.istKorrektur) {
      korrekturen.push(b);
    } else {
      const liste = nachMitarbeiter.get(b.mitarbeiterId) ?? [];
      liste.push(b);
      nachMitarbeiter.set(b.mitarbeiterId, liste);
    }
  }

  const summe = new Map<string, number>();
  for (const maBuchungen of nachMitarbeiter.values()) {
    const anteil = anteiligeDauer(maBuchungen, now);
    for (const b of maBuchungen) {
      summe.set(b.auftragId, (summe.get(b.auftragId) ?? 0) + (anteil.get(b.id) ?? 0));
    }
  }

  for (const b of korrekturen) {
    if (b.korrekturMinuten != null) {
      summe.set(b.auftragId, (summe.get(b.auftragId) ?? 0) + b.korrekturMinuten * 60);
    }
  }

  return summe;
}
