# KF3-33: Materialreservierung + Verfügbarkeitsprüfung

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 2 (Material je Auftrag reservieren; Verfügbarkeit beim Anlegen sichtbar)

## Entscheidung (Synthese aus zwei Design-Entwürfen)

**Minimal-Modell, robuste Verfügbarkeits-Architektur.** Eine Reservierung ist ein dispositiver Anspruch — KEINE Materialbewegung (Bestand bleibt Summe der Bewegungen) und KEIN ISO-Nachweis (das sind AuditEvent + Material-Snapshot). Deshalb:

- **Kein Status-Enum:** Der Lebenszyklus ist die Existenz der Zeile; „verbraucht/aufgelöst“ = gelöscht in derselben Transaktion wie die ersetzende Entnahme. Historie über `AuditEvent` (aktionen `reserviert`/`reservierungAufgeloest`).
- **`onDelete: Cascade`** am Auftrag (Anspruch stirbt mit dem Auftrag), `@@unique([auftragId, artikelnummer])`, `@@index([artikelnummer])`.
- **Reserviert wird der volle Anspruch** der Bedarfsposition (`ausLager + nettobedarf`; bei lagergedeckten Baugruppen `ausLager`) — schützt auch eintreffende Ware. Bei Teilbestand wird dadurch mehr reserviert als später entnommen (V2-Entnahme-Quirk `ausLager ODER nettobedarf`) — gewollt, dokumentiert.

## Verfügbarkeit — eine Wahrheitsquelle (`src/lib/reservierung.ts`)

- `reserviertJeArtikel(db, ausserAuftragId?)` — Summe offener Reservierungen je Artikel (groupBy, Spiegel von `bestandJeArtikel`).
- **Prioritätsregel (E2E-Befund):** Das auftragsbezogene Netting mindert der effektive Bestand nur um Reservierungen **älterer** Aufträge (`fremdeAeltereReservierungen`, Anker `auftrag.erstelltAm` — stabil über Beleg-Refreshes). Wer zuerst reserviert hat, behält seinen Anspruch; sonst würde ein später angelegter, nur teilgedeckter Auftrag mit seinem vollen Anspruch die Kommissionierung des früheren blockieren.
- **Netting-/Lagersicht:** `effektiv = max(0, bestand − fremde ÄLTERE Reservierungen)` — fließt über `nettobedarfFuerAuftrag`/`bedarfsbaum`/`sollSekundenNetto` in Netting, Bedarf-API, Soll-Zeit und Snapshot (Snapshot dokumentiert damit den Stand, der für DIESEN Auftrag GALT — ISO-genauer).
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

## Review-Fixes (2026-06-11, adversarialer Review)

- **Dispositive vs. physische Sicht getrennt** (hoch): Der V2-Entnahme-Quirk (`ausLager ODER nettobedarf`) ist für physischen Bestand entworfen — mit effektiver Sicht entstanden bei Force-Kommissionierung Über-/Unterbuchungen. Jetzt: Mangel-Gate + Anlage-Warnung + Planungsansichten = **effektiv**; Entnahme-Buchung, Snapshot und Soll-Zeit-Einfrierung = **physisch** (`nettobedarfFuerAuftrag(db, id, "physisch")`).
- **Beleg-Refresh-Guard** (hoch): `status === "offen"` war ein falscher Proxy — manuelle Entnahme lässt den Status stehen, Reaktivierung setzt ihn zurück; der Refresh re-reservierte bereits entnommenes Material (doppelte Minderung). Jetzt: Re-Reservierung nur, wenn KEINE Entnahmen existieren und der Status offen/laeuft/pausiert ist.
- Beleg-Import-Transaktion läuft `Serializable` mit einmaligem P2034-Retry (wie POST /api/auftraege — war als „wie oben“ versprochen, fehlte aber).
- Backfill verarbeitet Aufträge `orderBy erstelltAm asc` (sonst invertiert sich die Prioritätsregel bei Baugruppen-Deckung).
- Prioritätsregel mit deterministischem Tiebreaker (identisches `erstelltAm` → ID-Vergleich).
- POST /api/auftraege: alle DB-Fehler laufen durch `handlePrismaError` (zweiter P2034 → 409 statt 500).

## Akzeptanzkriterien

- [ ] Anlage mit Positionen reserviert Material; zweiter Auftrag sieht reduzierten effektiven Bestand (Fehlteil-Warnung)
- [ ] Kommissionierung löst Reservierung in derselben Transaktion auf — verfügbar zählt nie doppelt
- [ ] Bestellvorschläge berücksichtigen Reservierungen (reservierte Fehlmenge → Vorschlag)
- [ ] Material-Seite zeigt Reserviert/Verfügbar; Artikel-Umbenennen zieht Reservierungen mit um
- [ ] Alle drei Entnahmepfade (Kommissionierung, Direktabschluss, manuelle Entnahme) lösen auf (Tests)
