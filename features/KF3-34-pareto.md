# KF3-34: Pareto-Auswertungen (Fehlteile, Nacharbeitsgründe)

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 2 (80/20-Entscheidungsbasis: Was fehlt am häufigsten? Welche Gründe dominieren Nacharbeit?)

## Umsetzung

**Rein abgeleitet, keine neuen Tabellen** — nur zwei Indexe (`Abweichung @@index([typ, erfasstAm])`, `BestellPosition @@index([auftragId])`).

- **API `GET /api/auswertung/pareto`** (Recht `auswertung`): `typ=nacharbeitsgruende|fehlteile`, `von/bis` (Kalendertage, `lokalDatum`-Vergleich Europe/Berlin, Default 90 Tage), bei Gründen `abwTyp` (nacharbeit|ausschuss|reklamation…|alle), bei Fehlteilen `quelle` (`bestellbezug` = BestellPositionen mit auftragId, ohne stornierte; `mangel` = Material-Snapshots mit nettobedarf>0 auf Aufträgen mit stalledMissingParts), `limit` Top-N (Rest „Sonstige“). Response mit `anzahl/prozent/kumProzent` serverseitig; `grundId=null` als eigener Eintrag „(ohne Grund)“. Aggregation in JS (Prisma-groupBy mit Relationsfilter unzuverlässig).
- **CSV** `GET /api/auswertung/pareto.csv` über vorhandenes `csvResponse()`.
- **UI:** dritter Tab „Pareto“ auf der Auswertungs-Seite → `src/components/pareto-block.tsx`: Recharts ComposedChart (Balken = Anzahl, Linie = kumulierte %, ReferenceLine 80 %), Steuerzeile (Auswertung/Quelle/Typ/Zeitraum/CSV), Karte „Top-Verursacher bis 80 %“. Dünne Datenlage: Empty-State bei 0, Hinweis „geringe Datenbasis“ bei n<10; Badge-Warnung, wenn „(ohne Grund)“ >20 %.
- **Grund-Katalog-Verwaltung** (fehlte komplett): Verwaltungs-Tab „Abweichungsgründe“ (Muster Zeitkategorien) + `PATCH /api/abweichungen/gruende/[id]` (Recht `verwaltung`; name/bereich/aktiv; kein DELETE — Gründe hängen an ISO-Aufzeichnungen, deaktivieren statt löschen). `bereich` per Zod-Whitelist `nacharbeit|fehlteil|fuenfs` gehärtet (DB bleibt String — KF3-36 erweitert).
- **Datenqualität:** Auto-Reklamationen aus dem Wareneingang bekommen einen Default-Grund „Wareneingang abweichend“ (sonst dominiert „(ohne Grund)“ die Lieferanten-Pareto).

## Bekannte Verzerrungen (im UI benannt)

- Fehlteil-Signale sind erfasst, nicht gemessen: `stalledMissingParts` ist ein Hand-Flag, `BestellPosition.auftragId` optional → Untererfassung möglich.
- Snapshot wird bei Re-Kommissionierung ersetzt — Mangel-Quelle zählt den letzten Stand.

## Review-Fixes (2026-06-11, adversarialer Review)

- Param-Härtung: kalendarisch ungültige Daten („2026-02-31“) → 400 statt 500; Zeitraum auf 730 Tage begrenzt.
- Auch das **Anlegen** von Gründen ist auditiert (POST-Route + systemseitige Anlage des WE-Default-Grunds).
- Chart-X-Achse kürzt das **Label** statt des Keys (bei Gründen war der Key eine UUID).
- UI-Default-Zeitraum als Europe/Berlin-Kalendertag (vorher UTC — Drift um Mitternacht).
- `csvResponse` (global, alle CSV-Exporte): Formel-Injection-Schutz für Texte mit führendem `= + - @`.

## Akzeptanzkriterien

- [ ] Pareto Nacharbeitsgründe aus Abweichungen + Grund-Katalog, Zeitraum filterbar, CSV-Export
- [ ] Pareto Fehlteile aus beiden Quellen (Bestellbezug, Kommissionier-Mangel) mit sichtbarer Quellenangabe
- [ ] Grund-Katalog im Verwaltungsbereich pflegbar (anlegen/umbenennen/deaktivieren), auditiert
- [ ] 80/20-Lesehilfe: kumulierte Linie + Top-Verursacher-Liste
