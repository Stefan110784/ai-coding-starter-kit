/** ISO-8601-Kalenderwochen-Arithmetik (UTC-basiert, datumsgenau). */

/** Wochentag nach ISO: Montag = 1 … Sonntag = 7. */
function isoWochentag(d: Date): number {
  const dow = d.getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Montag einer ISO-Kalenderwoche als UTC-Mitternacht (Python: date.fromisocalendar(y, w, 1)). */
export function montagVonIsoWoche(jahr: number, woche: number): Date {
  // Der 4. Januar liegt immer in KW 1.
  const jan4 = new Date(Date.UTC(jahr, 0, 4));
  const montagKw1 = new Date(jan4);
  montagKw1.setUTCDate(jan4.getUTCDate() - (isoWochentag(jan4) - 1));
  const d = new Date(montagKw1);
  d.setUTCDate(montagKw1.getUTCDate() + (woche - 1) * 7);
  return d;
}

/** Sonntag einer ISO-Kalenderwoche als UTC-Mitternacht. */
export function sonntagVonIsoWoche(jahr: number, woche: number): Date {
  const d = montagVonIsoWoche(jahr, woche);
  d.setUTCDate(d.getUTCDate() + 6);
  return d;
}

/** ISO-Jahr und -Woche eines Datums (UTC-Datumsanteil). */
export function isoWocheVonDatum(datum: Date): { jahr: number; woche: number } {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  // Auf den Donnerstag derselben Woche schieben — dessen Jahr ist das ISO-Jahr.
  d.setUTCDate(d.getUTCDate() + 4 - isoWochentag(d));
  const jahr = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(jahr, 0, 1));
  const woche = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return { jahr, woche };
}

/** Verschiebt eine ISO-Woche um `delta` Wochen (negativ = rückwärts). */
export function verschiebeIsoWoche(
  jahr: number,
  woche: number,
  delta: number
): { jahr: number; woche: number } {
  const montag = montagVonIsoWoche(jahr, woche);
  montag.setUTCDate(montag.getUTCDate() + delta * 7);
  return isoWocheVonDatum(montag);
}
