# KF3-28: Material-Snapshot am Auftrag

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 1 (ISO 7.5: „versionierte Stücklisten") — pragmatischer Snapshot statt Voll-Versionierung

## Entscheidung

Stücklisten werden in V3 live aufgelöst und beim Ändern überschrieben — die ISO-Frage „welcher Materialstand galt für Auftrag X?" war nicht beantwortbar. Eine Voll-Versionierung (Versionskopf, gültigAb, Freigabe-Workflow) wäre L-Aufwand und ist laut Anforderung Kap. 6 erst für die F&E-Schnittstelle relevant. Stattdessen: **Snapshot der aufgelösten Stückliste bei Kommissionierung** — das `NettobedarfResult` liegt in der Status-Transaktion ohnehin schon vor.

## Umsetzung

- **Schema:** `AuftragMaterialSnapshot` (auftragId, artikelnummer, bezeichnung, einheit, bruttobedarf, bestand, nettobedarf, ausLager, typ; `@@unique([auftragId, artikelnummer])`). Migration `20260611135625_material_snapshot`.
- **Lib:** `materialSnapshotSchreiben(tx, auftragId, bedarf?)` in `src/lib/stueckliste.ts` neben `entnahmenBuchen`; Re-Kommissionierung überschreibt den alten Stand.
- **Aufrufstellen** in `PATCH /api/auftraege/[id]` (beide Buchungspfade): Kommissionierung (offen → kommissioniert) und Entnahme-Nachbuchung bei direktem Abschluss.
- **Bedarfs-API** `/api/material/bedarf/[auftragId]`: existiert ein Snapshot, kommen die Positionen daraus (`eingefroren: true` + Zeitstempel); der Strukturbaum bleibt Live-Sicht. UI: Badge „Stand Kommissionierung" im Materialbedarf-Block.

## Akzeptanzkriterien

- [x] Kommissionierung friert die aufgelöste Stückliste inkl. damaliger Bestände ein
- [x] Bedarfs-Tab zeigt danach den eingefrorenen Stand (Badge), nicht die Live-Auflösung
- [x] Spätere Stücklisten-Änderungen verändern den Nachweis kommissionierter Aufträge nicht

## Bewusst nicht

Voll-Versionierung der Stücklisten (eigenes Feature, falls F&E-Übergabe es braucht; 80/20-Option: Änderungsjournal über AuditEvent an `StuecklistePosition`).
