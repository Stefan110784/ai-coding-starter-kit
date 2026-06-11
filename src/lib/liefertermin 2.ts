/**
 * Parst Liefertermin-Freitexte in ein konkretes Datum (Port von V2
 * services/liefertermin.py). Bei KW/CW-Angaben wird der Montag der
 * ISO-Kalenderwoche zurückgegeben; null wenn nichts erkannt wurde.
 *
 * Beispiele: "KW 24/2026", "CW24 26", "15.06.2026", "6.6.26", "2026-06-15".
 */
import { montagVonIsoWoche } from "@/lib/isowoche";

const KW_RE = /\b(?:KW|CW)\s*[.\-/]?\s*(\d{1,2})\s*[/.\-,\s]+\s*(\d{2,4})\b/i;
const DE_DATE_RE = /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/;
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

/** 2-stelliges Jahr → 4-stellig: 00–49 → 20xx, 50–99 → 19xx. */
function vollstaendigesJahr(j: number): number {
  if (j < 100) return j < 50 ? 2000 + j : 1900 + j;
  return j;
}

function utcDatum(jahr: number, monat: number, tag: number): Date | null {
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  // Überlauf (z. B. 32.01.) erkennen
  if (d.getUTCFullYear() !== jahr || d.getUTCMonth() !== monat - 1 || d.getUTCDate() !== tag) return null;
  return d;
}

export function parseLiefertermin(text: string | null | undefined): Date | null {
  if (!text) return null;

  // KW/CW-Format hat Priorität (vor numerischen Datums-Matches)
  const kw = KW_RE.exec(text);
  if (kw) {
    const woche = parseInt(kw[1], 10);
    const jahr = vollstaendigesJahr(parseInt(kw[2], 10));
    if (woche >= 1 && woche <= 53) return montagVonIsoWoche(jahr, woche);
  }

  const de = DE_DATE_RE.exec(text);
  if (de) {
    const d = utcDatum(vollstaendigesJahr(parseInt(de[3], 10)), parseInt(de[2], 10), parseInt(de[1], 10));
    if (d) return d;
  }

  const iso = ISO_DATE_RE.exec(text);
  if (iso) {
    const d = utcDatum(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
    if (d) return d;
  }

  return null;
}
