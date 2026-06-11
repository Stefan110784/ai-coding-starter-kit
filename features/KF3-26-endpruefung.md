# KF3-26: Endprüfung mit hartem Gate

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 1 (ISO 9001 Kap. 8.6: „Endprüfung vor Auslieferung mit Prüfprotokoll") · Nutzer-Entscheidung: **hartes Gate**

## Entscheidung

- **Kein neuer Auftragsstatus** — ein neuer Enum-Wert wäre invasiv (Badges, Filter, Arbeitsvorrat, KPI-Logik, V2-Altdaten). Die Prüfung ist ein Pflicht-Dokument, kein Workflow-Schritt.
- **Vereinheitlichtes `Pruefung`-Modell** mit `typ` (endpruefung | wareneingang): Die Eingangsprüfung (KF3-30) nutzt dasselbe Modell über `bewegungId @unique` (Muster `InventurZaehlung`). Deshalb wird das Modell **vor** dem Bestellwesen festgezogen.
- **`onDelete: SetNull`** am Auftrag: Das Prüfprotokoll ist ISO-Aufzeichnung und überlebt die Auftrags-Löschung.

## Umsetzung

- **Schema:** `Pruefung` (typ, ergebnis ok/bedingtFrei/abweichend, auftragId?, bewegungId? @unique, artikelnummer?, menge?, bemerkung?, prueferId, geprueftAm). Migration `20260611134357_pruefung`.
- **Hartes Gate** in `PATCH /api/auftraege/[id]`: Übergang → `abgeschlossen` bei Nicht-L-Aufträgen verlangt eine Endprüfung mit `ergebnis ∈ {ok, bedingtFrei}`, sonst `409 { error: "pruefungFehlt" }`. Bewusst **ohne force-Umgehung** (anders als das Material-Gate). Greift VOR allen Buchungs-Hooks. L-Aufträge (Lagerfertigung) sind ausgenommen.
- **API:** `GET/POST /api/auftraege/[id]/pruefung` (POST mit Recht `qualitaet`; Bemerkung Pflicht bei ergebnis ≠ ok; schreibt zusätzlich AuditEvent „endpruefung").
- **UI:** `src/components/pruefung-dialog.tsx` — „Abschließen" ohne Prüfung öffnet automatisch den Prüfdialog (3 große Ergebnis-Buttons, Bemerkung); nach Freigabe wird der Abschluss direkt erneut ausgelöst. Ein Fluss, tablettauglich.
- **Sperrbestand-Konzept (Kap. 1, 8.7):** kein neues Modell — dedizierter Lagerort „Sperrlager / WE-Prüfung" als Stammdatum anlegen (Verwaltung → Lagerorte); Freigabe = vorhandene Umlagerungs-Buchung. Wareneingang bucht ab KF3-30 bei Prüfergebnis „abweichend" dorthin.

## Akzeptanzkriterien

- [x] P-/S-Auftrag ohne Prüfung lässt sich nicht abschließen (409), Dialog öffnet sich
- [x] Mit „Bestanden"/„Bedingt frei" wird abgeschlossen; „Nicht bestanden" dokumentiert und bleibt offen
- [x] L-Aufträge unverändert (kein Gate)
- [x] Jede Prüfung erscheint im Audit-Verlauf mit Prüfer + Zeit
