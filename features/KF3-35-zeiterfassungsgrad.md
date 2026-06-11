# KF3-35: Zeiterfassungsgrad-KPI

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 4 (Prozess-KPI, keine Leistungskennzahl)

## Harte Leitplanken (aus der Anforderung)

**Nur Team, nur Monat, nie pro Person** (3-Mann-Betrieb, Mitbestimmung) — strukturell absichert: `ZeitSollMonat` hat KEINEN Mitarbeiter-FK (ein Personen-Soll ist gar nicht abbildbar), die Berechnungsfunktion gibt nur die Teamsumme zurück, die API-Response enthält nie Personenwerte (per Test fixiert). Zielkorridor **70–85 %**, beide Richtungen schlecht (<70: Datenqualität/Gemeinkosten; >85: unplausibel). Werte >100 % werden angezeigt, nicht gekappt (ehrliches Datenqualitätssignal durch Nachträge/Korrekturen).

## Umsetzung

- **Schema:** `ZeitSollMonat` (monat "YYYY-MM" @unique, sollStunden, bemerkung — EIN Team-Wert je Monat); `Mitarbeiter.wochenstunden Float?` (nur Berechnungsgrundlage für den Soll-VORSCHLAG); `Zeitkategorie.auftragsbezogen Boolean @default(true)` (Kategorien wie „Aufräumen/Besprechung“ zählen nicht in den Zähler — sonst bricht die Korridor-Semantik).
- **Soll = manuell gepflegter Team-Monatswert** statt Berechnung aus Wochenstunden+Abwesenheiten: kein Abwesenheitsmodell (Krankheit = Art.-9-DSGVO-Minenfeld; 1 Urlaubswoche ≈ 7,7 pp bei 15 pp Korridorbreite — der Wert MUSS Abwesenheiten kennen, die Pflege ist 1 Zahl/Monat). Dialog zeigt den feiertagsblinden Vorschlag (Σ wochenstunden/5 × Mo–Fr-Tage) nur als Vorbelegung mit Warnhinweis; Upsert auditiert.
- **Berechnung:** `src/lib/zeiterfassungsgrad.ts` (reine Funktion + Loader; Wiederverwendung `anteiligeDauer` aus zeit.ts inkl. Parallelarbeit/Nachträge/Korrekturen, Monatszuordnung `lokalDatum(start)` wie mitarbeiterReport).
- **APIs:** `GET /api/auswertung/zeiterfassungsgrad?monat=` + `/verlauf?monate=` (Recht auswertung); `GET|PUT /api/zeitsoll` (PUT Recht verwaltung, max 1000 h, kein DELETE); wochenstunden/auftragsbezogen an den bestehenden Stammdaten-Routen.
- **UI:** `zeiterfassungsgrad-block.tsx` als Monats-Abschnitt im KPI-Tab (Monats-Navigation, Korridor-Färbung beidseitig, 12-Monats-Verlauf mit ReferenceArea 70–85, Soll-Pflege-Dialog); Verwaltung: Wochenstunden am Mitarbeiter, „zählt als Auftragszeit“-Schalter an Zeitkategorien.

## Bewusst NICHT

Stempeluhr/Anwesenheitserfassung (V2-Non-Goal), Abwesenheitsmodell, Feiertagsberechnung, Personenwerte in jeglicher Form, Wochen-/Tagesgrad (bei 3 MA faktisch personenbeziehbar), Wochenstunden-Historisierung (Monats-Soll friert ein), CSV-Export v1.

## Akzeptanzkriterien

- [ ] Grad = Team-Auftragszeit / Monats-Soll, nur bei gepflegtem Soll (sonst „–“ + Pflege-Hinweis)
- [ ] API-Response enthält strukturell keine Personenwerte (Test)
- [ ] Korridor 70–85 sichtbar (Karte + Verlaufsband), >100 % wird angezeigt
- [ ] Nicht-auftragsbezogene Kategorien zählen nicht in den Zähler
