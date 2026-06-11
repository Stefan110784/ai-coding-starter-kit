# KF3-30: Wareneingang gegen Bestellung

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 3 (Wareneingang) + Kap. 1 (ISO 8.4/8.6 Eingangsprüfung) — Schritt 1 der Empfehlung Kap. 8

## Umsetzung

- **Route** `POST /api/einkauf/bestellungen/[id]/wareneingang` (Recht `lager.buchen`), eigene Route statt Erweiterung von `/api/material/bewegungen` (die bleibt für bestellfreie Eingänge). Eine Transaktion:
  1. Statusprüfung (storniert/angefragt → 400), Positionszugehörigkeit.
  2. **Soll-Ist-Abgleich:** Überlieferung → `409 { ueberliefert }`, buchbar nur mit `ueberlieferungBestaetigt` (wird in der Bewegungs-Bemerkung dokumentiert).
  3. Je Position: `Materialbewegung` (art wareneingang, `bestellPositionId`, `einstandspreis` aus dem Bestellpreis → speist die Materialbewertung F-8) + **Eingangsprüfung** als `Pruefung` (typ wareneingang, `bewegungId @unique` — Modell aus KF3-26).
  4. Prüfergebnis „abweichend" → automatisch `Abweichung` typ `reklamationLieferant` (KF3-27 dockt an; Pflicht-Befund).
  5. **Statusautomatik:** alle Positionen voll → abgeschlossen, sonst teilgeliefert (auditiert).
- **UI:** `wareneingang-dialog.tsx` tablet-first — Restmengen vorbelegt, Lagerort-Select (Sperrlager-Empfehlung bei Abweichung), Prüf-Toggle je Position, Artikel-Scan markiert die Zeile (`ScanButton` aus KF3-22), Überlieferungs-Bestätigung.
- **Teillieferungen** = mehrere Buchungen je Position; Liefertreue-Messpunkte (gebuchtAm vs. effektiver Termin) entstehen hier für KF3-32.

## Akzeptanzkriterien

- [x] Teillieferung buchbar, Status springt automatisch teilgeliefert/abgeschlossen
- [x] Überlieferung nur mit expliziter Bestätigung
- [x] Jede (Teil-)Lieferung hat ein Prüfprotokoll; „abweichend" erzeugt eine Lieferanten-Reklamation
- [x] Einstandspreis aus der Bestellung fließt in die Materialbewertung
