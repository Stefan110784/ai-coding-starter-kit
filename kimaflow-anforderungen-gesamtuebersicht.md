# KIMA Flow – Funktionsumfang & Ausbaustrategie

**Zusammenfassung der Anforderungsdiskussion** · Stand: Juni 2026

Themen: ISO-9001-Anforderungen, Fertigung, Lager, Beschaffung, KPIs, 5S, Ausbaupfad und CRM-Anbindung (CAS genesisWorld).

-----

## 1. Pflichtanforderungen aus ISO 9001 (Nachweisfähigkeit)

Die Norm schreibt keine Software vor, verlangt aber Nachweise. Kern: **lückenlose Historie statt überschreibbarer Felder.**

|Anforderung                                                                       |Normbezug|
|----------------------------------------------------------------------------------|---------|
|Rückverfolgbarkeit: Chargen-/Seriennummern über Wareneingang, Einbau, Auslieferung|8.5.2    |
|Benutzer- und Zeitstempel auf jeder Buchung, Audit-Log auf Buchungsebene          |7.5      |
|Wareneingangsprüfung mit dokumentiertem Ergebnis                                  |8.4, 8.6 |
|Endprüfung vor Auslieferung mit Prüfprotokoll                                     |8.6      |
|Sperrstatus im Lager: gesperrt / geprüft / freigegeben, Sperrbestand getrennt     |8.7      |
|Erfassung von Nacharbeit und Reklamationen mit Ursache und Maßnahme               |8.7, 10.2|
|Eindeutige Lagerplätze, FIFO wo relevant, Buchungshistorie                        |8.5.4    |
|Versionierte Arbeitsanweisungen und Stücklisten                                   |7.5      |
|KPIs: Liefertreue, Nacharbeitsquote, Fehlteile, Durchlaufzeit                     |9.1      |

-----

## 2. Funktionen zur Verbesserung der Fertigung

**Planung und Steuerung**

- Fertigungsaufträge mit Priorität und Solltermin, Tagesliste als sortierte Queue (bei 3 Mitarbeitern kein komplexes APS nötig)
- Materialverfügbarkeitsprüfung beim Anlegen eines Auftrags

**Bestandsintelligenz**

- Meldebestände mit automatischem Bestellvorschlag (EOQ-Modul vorhanden)
- Materialreservierung auf Aufträge, damit zwei Aufträge nicht denselben Bestand sehen

**Shopfloor**

- Barcode-/QR-Scanning für alle Buchungen (senkt Fehlbuchungen massiv)
- Digitale Arbeitsanweisung in richtiger Version direkt am Auftrag
- Rückmeldung per Tablet: Start, Stopp, Stückzahl, Problem

**Auswertung und Kommunikation**

- Ist-Zeiten pro Arbeitsgang als Kalkulationsgrundlage
- Pareto-Auswertung von Fehlteilen und Nacharbeitsgründen
- Statusampel pro Auftrag, einsehbar für Vertrieb und Geschäftsführung

-----

## 3. Beschaffung

**Bedarfsermittlung**

- Bestellvorschläge aus Meldebestand, offenen Fertigungsaufträgen und Wiederbeschaffungszeit
- EOQ als Vorschlagsmenge, manuelle Übersteuerung mit Begründung

**Bestellabwicklung**

- Bestellstatus: angefragt / bestellt / teilgeliefert / abgeschlossen
- Zugesagte Liefertermine erfassen (Basis für Liefertreue-Messung)
- Offene-Bestellungen-Liste mit Ampel für überfällige und kritische Positionen

**Wareneingang**

- Buchung gegen die Bestellung mit automatischem Soll-Ist-Abgleich
- Teillieferungen sauber abbilden
- Eingangsprüfung direkt im Wareneingang (9001-Nachweis nebenbei erledigt)

**Lieferantenmanagement (8.4)**

- Freigegebene Lieferanten je Artikel
- Automatische Lieferantenbewertung aus Termintreue (Wareneingang) und Qualität (Eingangsprüfung, Reklamationen) – keine separate Excel-Pflege
- Preishistorie pro Artikel und Lieferant

**Verknüpfung zur Fertigung**

- Fehlteil im Auftrag → direkt Bestellanforderung erzeugen
- Auftrag zeigt erwartete bestellte Teile und deren Termine

-----

## 4. KPI: Zeiterfassungsgrad (Anwesenheit vs. Auftragszeit)

**Bewertung: sinnvoll, aber nur als Prozess-KPI, nicht als Leistungskennzahl.**

- Nutzen: Datenqualität der Ist-Zeiten absichern, Gemeinkostenzeit transparent machen, Prozessprobleme früh erkennen
- **Nur als Teamkennzahl auf Monatsebene, nie pro Person** – bei 3 Mitarbeitern wird jede personenbezogene Auswertung persönlich und verzerrt das Buchungsverhalten
- Realistischer Zielkorridor: ca. 70–85 %, 100 % sind weder erreichbar noch wünschenswert
- Nicht-Auftragszeiten als buchbare Kategorien anlegen (Rüsten, Logistik, Orga), damit die Differenz erklärbar wird
- Mitbestimmung beachten: personenbezogene Leistungsauswertung offen kommunizieren

-----

## 5. 5S-Integration

**Grundsatz: 5S lebt am Shopfloor, die Software ist nur das Rückgrat.**

Digital abbilden:

- **Audit-Funktion:** digitale Checkliste pro Bereich, per Tablet, mit Punktebewertung und Foto-Upload, monatlicher Rhythmus mit Erinnerung
- **Maßnahmenverfolgung:** Abweichung → Maßnahme mit Verantwortlichem, Termin und Ampel (gleichzeitig 9001-Nachweis für kontinuierliche Verbesserung, Kap. 10)
- **Trend-Auswertung:** Score pro Bereich über Zeit, Pareto der Abweichungskategorien
- **Verknüpfung:** Lagerplatz-Stammdaten = Seiton; Soll-Zustand-Fotos als versionierte Standards (Seiketsu)

Bewusst **nicht** digitalisieren: tägliche 5-Minuten-Routinen, sonst kippt 5S von Kultur zu Bürokratie.

Ausbauidee: Maßnahmenverfolgung später generisch als **zentrales CAPA-Modul** für 5S, Reklamationen und Audit-Findings.

-----

## 6. Ausbaupfad: Welcher Bereich als Nächstes?

Leitfrage: Wo docken die vorhandenen Daten an? Empfehlung folgt dem Wertstrom, nicht der Organisationsstruktur.

1. **Vertrieb / Kundenauftrag (Favorit):** Schicht über den Fertigungsaufträgen. Schließt die Kette Kundenauftrag → Fertigung → Material → Lieferung und macht Liefertreue Ende-zu-Ende gegen den Kundentermin messbar. Projekte (Meilensteine, Stundenbuchung) gleich mitdenken
1. **Service / Geräteakte (übernächster Schritt):** Pro ausgelieferter Anlage Seriennummer, Konfiguration, Firmware, Servicehistorie – passt zum Geschäftsmodell mit Mess- und Regelsystemen und nutzt die Rückverfolgbarkeit direkt weiter
1. **F&E (zuletzt):** Dokumentenlastig, lebt in anderen Tools. Schnittstelle zu KIMA Flow ist nur die Artikel-/Stücklistenübergabe, die über versionierte Stücklisten bereits angelegt ist

**Wichtig vor dem Ausbau:** Sobald Nutzer außerhalb des eigenen Teams dazukommen, vorher Rollen-/Rechtekonzept und Stammdatenverantwortung sauber ziehen.

-----

## 7. Anbindung CAS genesisWorld (CRM)

Vertrieb wird aktuell in CAS genesisWorld gepflegt. Anbindung ist möglich über REST-API (passt zum Python-Backend), alternativ SOAP, OpenSync oder Webhooks.

**Architekturprinzipien:**

- **Klare Datenhoheit:** CAS führend für Kunden, Kontakte, Verkaufschancen; KIMA Flow führend für Artikel, Bestände, Fertigungsaufträge, Liefertermine. Kein Feld bidirektional
- **Phase 1 lesend:** Kundenstamm und gewonnene Verkaufschancen aus CAS holen → Kundenaufträge in KIMA Flow erzeugen (Status `new`, Fertigungsfreigabe bleibt manuell)
- **Phase 2 schreibend:** Auftragsstatus und bestätigter Liefertermin zurück in die CAS-Kundenakte (ersetzt/füttert die Statusampel)
- **Technik:** Sync-Job per systemd-Timer (15-min-Intervall), Staging-Tabellen vor dem Import, Zuordnung ausschließlich über CAS-GUID, Soft-Delete statt Löschen, fehlertolerant (CAS-Ausfall blockiert KIMA Flow nie)

**Vorab klären:**

- Mit CAS-Partner/IT: REST-API aktiviert? Lizenzkosten für API-Zugriff? Technischer Benutzer mit Minimalrechten, Firewall/Netzwerk
- Mit Vertrieb: Pflichtfelder an der Verkaufschance (Kundenwunschtermin, Artikelbezug), Auslöse-Status für “gewonnen”, Zielfelder für den Rückkanal

Detaillierte Architektur-Skizze inkl. Datenmodell und Session-Plan: siehe `kimaflow-cas-sync-architektur.md`.

-----

## 8. Empfohlene Umsetzungsreihenfolge (gesamt)

1. **Wareneingang gegen Bestellung** – liefert Liefertreue, Lieferantenbewertung und Bestandsgenauigkeit fast gratis
1. **Barcode-/QR-Scanning** – eliminiert Datenfehler an der Quelle
1. **Materialreservierung** – beendet die Überraschung “Material war schon verplant”
1. **Zeiterfassung und 5S-Modul** – setzen auf der sauberen Datenbasis auf
1. **Kundenauftrag + CAS-Anbindung (Phase 1 lesend)** – Ende-zu-Ende-Liefertreue
1. **CAS-Rückkanal, später Service-Geräteakte**

Jeder Schritt nutzt die Daten des vorherigen und zahlt direkt auf die KPIs Fehlteile und Liefertreue ein.