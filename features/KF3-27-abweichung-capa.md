# KF3-27: Abweichung / Nacharbeit (Minimal-CAPA)

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 1 (ISO 8.7/10.2: „Nacharbeit und Reklamationen mit Ursache und Maßnahme") + Kap. 5 (Ausbauidee zentrales CAPA-Modul)

## Problem

Nacharbeit war nur ein Freitext (`Auftrag.reworkReason`) ohne Ursache, Maßnahme, Verantwortlichen oder Termin — kein 10.2-Nachweis, keine Pareto-Auswertung möglich.

## Schnitt: Minimalmodell jetzt, CAPA-Vollausbau später

Das Modell ist bewusst so geschnitten, dass 5S-Maßnahmen (KF3-36, `quelle`-Erweiterung) und Lieferanten-Reklamationen (KF3-30, `typ reklamationLieferant`) andocken. Späterer Vollausbau (eigene Maßnahmen-Tabelle 1:n, Wirksamkeitsprüfung, eigene Übersichtsseite) blockiert nichts davon.

## Umsetzung

- **Schema:** `Abweichung` (typ nacharbeit/ausschuss/reklamationKunde/reklamationLieferant; status offen/inBearbeitung/abgeschlossen; beschreibung, ursache, massnahme, grundId → `AbweichungsGrund`-Katalog, verantwortlichId → Mitarbeiter, faelligAm, erfasstVonId, abgeschlossenAm). `AbweichungsGrund` (name unique, bereich) als Katalog für Pareto (KF3-34). SetNull am Auftrag: ISO-Aufzeichnung überlebt Löschung. Migration `20260611134935_abweichung`.
- **API:** `GET/POST /api/abweichungen` (+ `PATCH /api/abweichungen/[id]` mit Funktionsrecht `qualitaet`; bewusst **kein DELETE** — Aufzeichnungspflicht), `GET/POST /api/abweichungen/gruende` (POST mit Verwaltungs-Recht). Alle Änderungen laufen über `auditFeldDiff` ins Audit-Log. `auftragNummer` denormalisiert (lesbar nach Auftrags-Löschung); Enum-Query-Parameter werden validiert (400 statt 500).
- **Ampel-Kopplung (Review):** Die Statusampel (KF3-24) leitet „Nacharbeit offen" aus offenen Abweichungen ab — Abschluss der letzten offenen Abweichung macht den Auftrag wieder grün; `reworkRequired` bleibt als historisches KPI-Flag unangetastet (Nacharbeitsquote unverändert).
- **KPI-Kompatibilität:** Anlegen mit `typ=nacharbeit` + Auftragsbezug setzt in derselben Transaktion `Auftrag.reworkRequired=true` + `reworkReason=beschreibung` — `kpiFuerZeitraum` (Nacharbeitsquote) funktioniert unverändert; die Felder gelten als abgeleitet (deprecated für Direktpflege).
- **UI:** `src/components/abweichung-block.tsx` im Qualität-Tab des Auftrags-Sheets — Liste mit Typ-/Grund-Badges, Überfällig-Markierung, Status-Select, Bearbeiten-Dialog (Ursache, Maßnahme, Verantwortlicher, Fälligkeit) + „Abweichung melden".

## Akzeptanzkriterien

- [x] Nacharbeit strukturiert meldbar (Ursache/Maßnahme/Verantwortlich/Termin), KPI-Nacharbeitsquote unverändert
- [x] Statusverfolgung mit automatischem Abschluss-Zeitstempel, überfällige Maßnahmen markiert
- [x] Grund-Katalog vorhanden (Pflege via API; Verwaltungs-UI folgt mit KF3-34)
- [x] Alle Änderungen im Audit-Verlauf

## Offen / Später

- Grund-Katalog-Pflege in der Verwaltungs-Seite (mit KF3-34 Pareto)
- Eigene Abweichungs-Übersichtsseite mit Ampel über alle Aufträge (CAPA-Vollausbau)
