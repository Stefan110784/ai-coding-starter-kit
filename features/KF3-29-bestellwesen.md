# KF3-29: Bestellwesen

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 3 (Bedarfsermittlung, Bestellabwicklung)

## Umsetzung

- **Schema** (Migration `…_einkauf_bestellwesen`): `Bestellung` (nr autoincrement → Anzeige „B-1001", Status angefragt/bestellt/teilgeliefert/abgeschlossen/storniert, Kopf-`zugesagtTermin`, Benutzerstempel) + `BestellPosition` (menge, preis, eingefrorene `vorschlagsmenge` + Pflicht-`uebersteuerungsGrund` bei Abweichung, Termin-Override, `auftragId` für Fehlteil-Bezug). `Materialbewegung.bestellPositionId` verknüpft Wareneingänge. **Gelieferte Menge wird berechnet, nicht denormalisiert** (Konvention `bestand.ts` — der Audit-Trail ist die Wahrheit).
- **Logik:** `src/lib/bestellung.ts` (effektiver Termin Position vor Kopf, DST-sichere Überfälligkeits-Ampel rot/gelb ≤3 Tage/grün, Statusautomatik, gelieferte/offene Mengen) + `src/lib/bestellvorschlag.ts` (verfügbar = Bestand + offen bestellt; Vorschlagsmenge = max(EOQ aus `eoq.ts`, Mindestmenge, Lücke zum Meldebestand); Lieferantenwahl EOQ-fähig vor günstigstem Preis). Co-located Tests (10 Fälle).
- **APIs:** `GET/POST /api/einkauf/bestellungen`, `GET/PATCH /api/einkauf/bestellungen/[id]` (Kurzschluss-Abschluss/Storno mit Restmenge nur mit Bemerkung), `GET /api/einkauf/vorschlaege`. Alle Statuswechsel/Feldänderungen im Audit-Log.
- **Rechte:** neue Gruppe `einkauf` (Seite) + Funktion `einkauf.bestellen`; Rollen-Standard: kommissionierung sieht Einkauf, Bestellen bleibt Admin.
- **UI:** Seite `/einkauf` (Sidebar) mit Tabs Bestellvorschläge | Bestellungen. Vorschläge: editierbare Menge, Begründungs-Dialog bei EOQ-Übersteuerung, eine Bestellung je Lieferant. Bestellungen: Ampel, Filter offen/alle, Detail-Sheet mit Positionen (bestellt/geliefert/Rest/Termin).

## Akzeptanzkriterien

- [x] Bestellvorschlag aus Meldebestand+EOQ, Übersteuerung nur mit Begründung
- [x] Offene-Bestellungen-Liste mit Überfälligkeits-Ampel (zugesagter Termin)
- [x] Statuskette angefragt→bestellt→teilgeliefert→abgeschlossen (+storniert), auditiert
