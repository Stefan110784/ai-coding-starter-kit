# KF3-37: Kundenauftrag-Modell

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 6 (Vertriebs-Schicht über den Fertigungsaufträgen, Ende-zu-Ende-Liefertreue) + Kap. 7 (CAS-Vorbereitung)

## Entscheidung (Synthese aus zwei Design-Entwürfen)

CAS-readyes Datenmodell, pragmatischer Lebenszyklus. CAS genesisWorld wird später führend für Kunden/Verkaufschancen (KF3-38) — KF3-37 verankert die Vertragspunkte aus Kap. 7 schon im Schema, baut aber KEINEN Sync:

- **`Kunde`**: `nr` (Anzeige „K-1001“, Muster Bestellung), `name`, `notiz`, **`aktiv`** (Soft-Delete — kein DELETE-Endpoint), **`casGuid String? @unique`** (manuell vorab mappbar), **`quelle`** („manuell“ | „migration“ | „cas“ — Datenhoheits-Marker: der Sync darf später nur `cas`-Datensätze feldführend überschreiben).
- **`Kundenauftrag`**: `nr` („KA-1001“), `kundeId` (Restrict), `bezeichnung`, `bestellNrKunde`, **`wunschtermin`** (Messlatte der E2E-Liefertreue), **`bestaetigtTermin`** (Rückkanal-Feld KF3-39, NIE automatisch aus FA-Terminen), `geliefertAm`, `casGuid @unique`, `quelle`, `notiz`, `aktiv`.
- **Status `neu → freigegeben → geliefert` (+`storniert`)**: „neu“ ist exakt der Status, den CAS-Phase-1 später erzeugt; **Fertigungsfreigabe bleibt manuell** (Kap.-7-Vertrag). „geliefert“ setzt `geliefertAm` (Default heute, überschreibbar) — KEIN Auto-Abschluss aus FA-Status; die UI zeigt einen Hinweis-Badge „alle Fertigungsaufträge abgeschlossen“. Alle Wechsel auditiert; Reaktivierung nur Admin.
- **FA-Verknüpfung n:1** über `Auftrag.kundenauftragId` (SetNull): im Auftrag-Detail (Auswahl) und beim Anlegen; erlaubt solange der Kundenauftrag `neu`/`freigegeben` ist. Beim Verknüpfen wird `Auftrag.kunde` vom Kundennamen nachgezogen (auditiert); beim Lösen bleibt der String als Historie.
- **Beleg-Import-Koexistenz:** Ist ein FA verknüpft, überschreibt der Import `kunde` NICHT mehr (Relation ist führend); weicht der Parser-Name ab → AuditEvent `kundeKonflikt` zur Sichtung.
- **E2E-Liefertreue:** `kpiKundenLiefertreue()` — Basis = gelieferte Kundenaufträge mit Wunschtermin, pünktlich = `lokalDatum(geliefertAm) <= lokalDatum(wunschtermin)` (Europe/Berlin). Eigene KPI-Karte „Liefertreue Kunde“ neben der FA-Liefertreue (unterschiedliche Grundgesamtheit — Tooltip erklärt). `kpiFuerZeitraum` bleibt unangetastet.
- **Rechte:** Gruppe `vertrieb` (Seite) + `vertrieb.bearbeiten` (anlegen/ändern/Status); Sidebar-Eintrag „Vertrieb“.
- **UI:** Seite `/vertrieb` mit Tabs **Kundenaufträge** (Liste mit Status/Terminen/FA-Fortschritt, Detail-Sheet 3xl mit Status-Führung, Terminen, verknüpften FAs inkl. Statusampel) und **Kunden** (Stammdaten, anlegen/bearbeiten/deaktivieren, casGuid-Feld).
- **Backfill:** `scripts/backfill-kunden.ts` legt aus den vorhandenen `Auftrag.kunde`-Strings normalisierte `Kunde`-Datensätze an (quelle „migration“, Review-Ausgabe). Bewusst KEIN automatisches Erzeugen von Kundenaufträgen und kein Merge-Tool.

## Bewusst NICHT gebaut (Scope-Grenzen)

Staging-Tabellen/Sync-Job/REST-Client (KF3-38), Rückkanal (KF3-39), Kontakte/Adressen (leben in CAS), Projekte/Meilensteine (Kundenauftrag ist die spätere Aufhänge-Entität — mitgedacht, nicht gebaut), Auto-Statuswechsel, Dubletten-Merge.

## Review-Fixes (2026-06-11, adversarialer Review — 25 Befunde, 12 eindeutige)

- **geliefertAm ⇔ Status gekoppelt:** nur bei Status `geliefert` setzbar, nie auf null (KA fiele sonst still aus der KPI-Basis); Statuswechsel auf geliefert ignoriert stale Vorab-Daten (Default = jetzt). Termine sind nach Lieferung/Storno eingefroren.
- **Kunde-Rename propagiert** in derselben Transaktion auf die `kunde`-Strings aller verknüpften FAs (auditiert `nameNachgezogen`); die Import-Konfliktprüfung vergleicht gegen den AKTUELLEN `Kunde.name` der Relation statt gegen den FA-String.
- **„Relation ist führend“ überall durchgesetzt:** POST /api/auftraege validiert die Verknüpfung IN der Serializable-Transaktion (kein TOCTOU), zieht den Kundennamen hart nach und auditiert; manueller `kunde`-Edit an verknüpften FAs → 400; UI sperrt die Felder.
- **Rechte:** Verknüpfen/Lösen/Umhängen erfordert `vertrieb.bearbeiten` (POST + PATCH + UI-Gate).
- **Quell-KA-Guard:** Lösen/Umhängen blockiert, wenn der bisherige KA geliefert/storniert ist (FA-Bestand ist Doku); Umhängen schreibt Lösen- UND Verknüpfen-Audit.
- **Kunde deaktivieren** nur ohne offene Kundenaufträge (409 mit Anzahl).
- UI: Termin-Inputs patchen onBlur statt je Tastendruck; Detail-Sheet lädt über den GET-Endpoint (FA-Tabelle mit Zugesagt/Abgeschlossen statt Statusampel — bewusste Vereinfachung, die Ampel lebt auf der Aufträge-Seite); Edit-Select zeigt auch nicht mehr offene verknüpfte KAs; Kundenauftrag-Auswahl im Anlage-Dialog; Verlauf kennt die neuen Audit-Aktionen; KPI-Karte mit Grundgesamtheits-Tooltip.

## Akzeptanzkriterien

- [ ] Kunde anlegen/bearbeiten/deaktivieren („K-nr“), kein Hard-Delete; casGuid manuell pflegbar
- [ ] Kundenauftrag mit Status-Lebenszyklus inkl. manueller Freigabe, alles auditiert
- [ ] Fertigungsaufträge verknüpfbar (Detail + Anlage); Badge wenn alle FAs abgeschlossen
- [ ] KPI „Liefertreue Kunde“ gegen Wunschtermin (null statt 0 % ohne Datenbasis)
- [ ] Beleg-Import überschreibt `kunde` bei verknüpften FAs nicht mehr (Konflikt → Audit)
- [ ] Backfill erzeugt Kundenstamm aus Bestandsdaten (auf Dev-DB ausgeführt)
