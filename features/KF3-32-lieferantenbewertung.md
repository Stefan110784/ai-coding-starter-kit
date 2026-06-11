# KF3-32: Lieferantenbewertung

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 3 / ISO 8.4 („Automatische Lieferantenbewertung aus Termintreue und Qualität — keine separate Excel-Pflege")

## Umsetzung

Rein abgeleitet, **kein eigenes Schema** — die Messpunkte entstehen im Wareneingang (KF3-30):

- **Termintreue:** Basis = voll gelieferte Bestellpositionen mit effektivem Termin (Position vor Kopf); pünktlich = letzte vervollständigende Wareneingangs-Buchung am/vor dem Termin (Tagesvergleich Europe/Berlin). Offene oder terminlose Positionen zählen nicht.
- **Qualität:** Anteil `ok` an allen Eingangsprüfungen (`Pruefung typ=wareneingang`) des Lieferanten.
- **Keine Daten → `null`** statt 0 % (keine falsche Schlechtbewertung neuer Lieferanten).

`src/lib/lieferantenbewertung.ts` (reine Funktion `berechneBewertung` + Loader, 4 Testfälle) · `GET /api/einkauf/lieferantenbewertung` (Recht `lieferanten`) · Anzeige als Badge-Block (≥95 % grün, ≥80 % neutral, darunter rot) im Lieferanten-Detail.

## Akzeptanzkriterien

- [x] Bewertung ohne manuelle Pflege, ausschließlich aus WE-Buchungen + Prüfungen
- [x] Teillieferungen korrekt: Termintreue erst bei Voll-Lieferung bewertet
