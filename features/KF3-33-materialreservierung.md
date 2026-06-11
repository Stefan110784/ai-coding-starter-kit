# KF3-33: Materialreservierung + Verfügbarkeitsprüfung

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 2 (Material je Auftrag reservieren; Verfügbarkeit beim Anlegen sichtbar)

## Entscheidung (Synthese aus zwei Design-Entwürfen)

**Minimal-Modell, robuste Verfügbarkeits-Architektur.** Eine Reservierung ist ein dispositiver Anspruch — KEINE Materialbewegung (Bestand bleibt Summe der Bewegungen) und KEIN ISO-Nachweis (das sind AuditEvent + Material-Snapshot). Deshalb:

- **Kein Status-Enum:** Der Lebenszyklus ist die Existenz der Zeile; „verbraucht/aufgelöst“ = gelöscht in derselben Transaktion wie die ersetzende Entnahme. Historie über `AuditEvent` (aktionen `reserviert`/`reservierungAufgeloest`).
- **`onDelete: Cascade`** am Auftrag (Anspruch stirbt mit dem Auftrag), `@@unique([auftragId, artikelnummer])`, `@@index([artikelnummer])`.
- **Reserviert wird der volle Anspruch** der Bedarfsposition (`ausLager + nettobedarf`; bei lagergedeckten Baugruppen `ausLager`) — schützt auch eintreffende Ware. Bei Teilbestand wird dadurch mehr reserviert als später entnommen (V2-Entnahme-Quirk `ausLager ODER nettobedarf`) — gewollt, dokumentiert.

## Verfügbarkeit — eine Wahrheitsquelle (`src/lib/reservierung.ts`)

- `reserviertJeArtikel(db, ausserAuftragId?)` — Summe offener Reservierungen je Artikel (groupBy, Spiegel von `bestandJeArtikel`).
- **Netting-/Lagersicht:** `effektiv = max(0, bestand − fremde Reservierungen)` — fließt über `ladeBomDaten`/`nettobedarfFuerAuftrag` in Netting, Bedarf-API, Soll-Zeit und Snapshot (Snapshot dokumentiert damit den Stand, der für DIESEN Auftrag GALT — ISO-genauer, im Schema kommentiert).
- **Beschaffungssicht (Bestellvorschläge):** `verfuegbar = bestand − reserviert + offen bestellt` — ungekappt, damit reservierte Fehlmengen Vorschläge auslösen.
- **Material-Seite:** zeigt `reserviert` + `verfuegbar` als Spalten; `unterMindest` bleibt bewusst reine Lagersicht (dokumentierte Divergenz wie in KF3-29).
- Alle Vergleiche mit `MENGEN_EPS` (bestellung.ts).

## Lebenszyklus (jede Änderung in derselben Transaktion wie ihr Auslöser)

| Ereignis | Wirkung |
|---|---|
| POST /api/auftraege (mit Positionen) | Netting gegen effektiven Bestand → Reservierungen + Audit; Response enthält `material: { mangel, mangelnd }` → UI-Warnung. Transaktion `Serializable` (+1 Retry bei P2034) gegen parallele Anlagen. |
| Beleg-Import (Anlage/Refresh) | wie oben — Refresh NUR bei `status=offen` (sonst sind Entnahmen schon gebucht) |
| Kommissionierung / Direktabschluss / manuelle Entnahme | Entnahmen buchen → `reservierungAufloesen` (idempotentes deleteMany) + Audit |
| Reaktivierung kommissioniert→offen | KEINE neue Reservierung (Material ist physisch entnommen; vorbestehender Doppelbuchungs-Quirk wird nicht verschärft) |
| Auftrag löschen | Cascade |
| kein TTL | bewusst — hängende Reservierungen sind über die Material-Seite sichtbar |

## Scope-Grenzen (bewusst)

- Der manuelle Anlage-Dialog erfasst keine Positionen (Positionen kommen aus Beleg-Import/API) — kein eigener Positions-Editor in diesem Paket; die Prüfung greift überall, wo Positionen existieren.
- Netting-Cache wird INNERHALB eines Auftrags weiterhin nicht dekrementiert (V2-Verhalten); KF3-33 löst auftragsÜBERgreifende Konflikte.
- Force-Kommissionierung kann fremde Ansprüche physisch verbrauchen (Warn-Philosophie, Audit `force:true`).

## Rollout

Bestehende offene Aufträge haben anfangs keine Reservierungen — einmaliges Backfill-Skript (`scripts/backfill-reservierungen.ts`: alle offenen Aufträge ohne Entnahmen → `reservierungAktualisieren`); auf der Dev-DB ausgeführt, für Produktion im Deploy-Runbook.

## Akzeptanzkriterien

- [ ] Anlage mit Positionen reserviert Material; zweiter Auftrag sieht reduzierten effektiven Bestand (Fehlteil-Warnung)
- [ ] Kommissionierung löst Reservierung in derselben Transaktion auf — verfügbar zählt nie doppelt
- [ ] Bestellvorschläge berücksichtigen Reservierungen (reservierte Fehlmenge → Vorschlag)
- [ ] Material-Seite zeigt Reserviert/Verfügbar; Artikel-Umbenennen zieht Reservierungen mit um
- [ ] Alle drei Entnahmepfade (Kommissionierung, Direktabschluss, manuelle Entnahme) lösen auf (Tests)
