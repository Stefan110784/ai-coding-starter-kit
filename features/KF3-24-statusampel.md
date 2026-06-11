# KF3-24: Statusampel

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 2 („Statusampel pro Auftrag, einsehbar für Vertrieb und Geschäftsführung")

## Ziel

Auf einen Blick erkennen, welche Aufträge kritisch sind — ohne neue Pflege-Felder. Die Ampel ist rein aus vorhandenen Daten abgeleitet und wird später die Datenquelle für den CAS-Rückkanal (KF3-39).

## Regeln (`src/lib/statusampel.ts`, Vorrang von oben nach unten)

1. `abgeschlossen` → **grau**
2. `stalledMissingParts` → **rot** („Fehlteile")
3. `promisedDate` überschritten (Tagesvergleich Europe/Berlin) → **rot**
4. `promisedDate` in ≤ 3 Tagen → **gelb**
5. offene Abweichung (KF3-27, Status ≠ abgeschlossen) → **gelb** („Nacharbeit offen") — bewusst NICHT `reworkRequired`: das ist das historische KPI-Flag und wird nie zurückgesetzt (Review-Befund)
6. `pausiert` → **gelb**
7. sonst → **grün** („Im Plan")

## Umsetzung

- Reine Funktion ohne Prisma-Import (server- und clientseitig nutzbar), injizierbares `heute` für Tests; co-located `statusampel.test.ts` (9 Fälle inkl. Berlin-Tagesgrenze).
- `src/components/statusampel-punkt.tsx` — farbiger Punkt mit Grund als Tooltip; eingebaut in die Auftragsliste (Nummer-Spalte).
- Dashboard: `/api/dashboard` liefert `ampel.zaehler` (rot/gelb/grün) + bis zu 12 kritische Aufträge mit Grund; neue Karte „Statusampel" auf der Startseite.

## Akzeptanzkriterien

- [x] Ampelfarbe + Grund je aktivem Auftrag in Liste und Dashboard
- [x] Kein Schreibzugriff, kein neues Schema — rein abgeleitet
- [x] Unit-Tests decken alle Regeln und die Zeitzonen-Tagesgrenze ab
