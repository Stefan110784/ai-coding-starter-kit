# KF3-32: Lieferantenbewertung

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 3 / ISO 8.4 („Automatische Lieferantenbewertung aus Termintreue und Qualität — keine separate Excel-Pflege")

## Umsetzung

Rein abgeleitet, **kein eigenes Schema** — die Messpunkte entstehen im Wareneingang (KF3-30):

- **Termintreue:** Basis = voll gelieferte Bestellpositionen mit effektivem Termin (Position vor Kopf); pünktlich = letzte vervollständigende Wareneingangs-Buchung am/vor dem Termin (Tagesvergleich Europe/Berlin). Offene oder terminlose Positionen zählen nicht.
- **Qualität:** Anteil `ok` an allen Eingangsprüfungen (`Pruefung typ=wareneingang`) des Lieferanten.
- **Keine Daten → `null`** statt 0 % (keine falsche Schlechtbewertung neuer Lieferanten).

`src/lib/lieferantenbewertung.ts` (reine Funktion `berechneBewertung` + Loader, 4 Testfälle) · `GET /api/einkauf/lieferantenbewertung` (Recht `lieferanten`) · Anzeige als Badge-Block (≥95 % grün, ≥80 % neutral, darunter rot) im Lieferanten-Detail.

## Review-Fixes (2026-06-11, adversarialer Review)

- Bewertungszeitraum auf **rollierende 12 Monate** begrenzt (`BEWERTUNG_MONATE`) — fachlich üblich und verhindert, dass der Loader unbegrenzt alle Bestellungen samt Bewegungen lädt; UI zeigt den Zeitraum an.
- Preisverlauf-Button im Lieferanten-Detail ist für alle mit Recht `lieferanten` sichtbar (vorher nur Admin, obwohl die API das Recht genügen lässt).

## Akzeptanzkriterien

- [x] Bewertung ohne manuelle Pflege, ausschließlich aus WE-Buchungen + Prüfungen
- [x] Teillieferungen korrekt: Termintreue erst bei Voll-Lieferung bewertet
