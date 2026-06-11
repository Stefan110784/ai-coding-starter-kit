# KF3-31: Preishistorie

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 3 („Preishistorie pro Artikel und Lieferant")

## Entscheidung

Eigenes append-only Modell `ArtikelLieferantPreis` statt `gueltigAb` am Link — das `@@unique([artikelnummer, lieferantId])` und die gesamte EOQ-API/-UI bleiben unangetastet; `einkaufspreis` am Link bleibt der aktuelle Wert. Zusätzlich dokumentiert `BestellPosition.preis` (KF3-29) die faktischen Bestellpreise.

## Umsetzung

- **Schema** (Migration `…_preishistorie` inkl. **Backfill**: je bestehendem Link der aktuelle Preis als initiale Zeile, quelle `manuell`, gueltigAb = Anlagedatum).
- **Hooks:** Link-Anlage (`POST /api/lieferanten/[id]/artikel`) und Preisänderung (`PATCH …/[linkId]`) hängen in derselben Transaktion eine Historien-Zeile mit Benutzerstempel an. Quelle `bestellung` ist für automatische Übernahmen aus Bestellungen reserviert (bewusst noch nicht aktiv — Stammdatenpreis ändert sich nicht implizit).
- **Lesen:** `GET /api/lieferanten/[id]/artikel/[linkId]` (Recht `lieferanten`), neueste zuerst.
- **UI:** Verlauf-Icon je Artikel-Link im Lieferanten-Detail → Dialog mit Gültig-ab/Preis/Quelle/Benutzer.

## Review-Fixes (2026-06-11, adversarialer Review)

- **FK auf den Link entfernt** (Migration `…_preishistorie_entkoppelt`, Muster `AuditEvent`): die Historie wurde sonst beim Löschen der Verknüpfung per Cascade mitgelöscht — Widerspruch zum Append-only-/ISO-Anspruch. `artikelnummer` + `lieferantId` sind jetzt denormalisiert (Backfill enthalten), die Hooks schreiben sie mit.
- Preisrundung auf die Decimal(10,4)-Genauigkeit VOR Vergleich und Speicherung — Eingaben wie 1.23456 erzeugten sonst bei jedem PATCH eine inhaltlich identische Duplikat-Zeile.
- Artikel-Umbenennen zieht `BestellPosition` und die denormalisierten Verweise (Preishistorie, Prüfung, Abweichung, Material-Snapshot) jetzt mit um.

## Akzeptanzkriterien

- [x] Jede Preisänderung erzeugt eine neue Zeile (Wer/Wann/Quelle), nichts wird überschrieben
- [x] Bestandsdaten per Backfill als Startpunkt der Historie
- [x] Historie überlebt das Löschen der Artikel-Lieferant-Verknüpfung
