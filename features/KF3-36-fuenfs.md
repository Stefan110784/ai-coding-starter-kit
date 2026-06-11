# KF3-36: 5S-Modul

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 5 („5S lebt am Shopfloor, die Software ist nur das Rückgrat“)

## Umsetzung

- **Schema:** `FuenfSBereich` (Stammdatum, verantwortlichId als Maßnahmen-Vorbelegung, aktiv statt DELETE), `FuenfSChecklistenPunkt` (EINE pflegbare globale Vorlage, Enum `FuenfSKategorie` seiri…shitsuke, Seed ~15 Punkte), `FuenfSAudit` (`@@unique([bereichId, monat])` = Monatsrhythmus erzwungen; Status entwurf/abgeschlossen; `scoreProzent` beim Abschluss EINGEFROREN — Trend bleibt stabil, auch wenn die Vorlage sich ändert), `FuenfSAuditPosition` (eingefrorener Punkttext + Kategorie, punkte 0|1|2, nichtAnwendbar, bemerkung, abweichungId?). `AbweichungTyp` + `fuenfs`.
- **Maßnahmen = vorhandenes CAPA** (KF3-27): Position → „Maßnahme anlegen“ erzeugt transaktional eine `Abweichung` typ `fuenfs` (Grund-Katalog bereich fuenfs, Verantwortlicher/Termin vorbelegt) — kein eigenes Maßnahmen-Modell. **`auftragId` ist bei typ fuenfs serverseitig verboten** (sonst färbt die 5S-Maßnahme die Statusampel des Auftrags). Typ-Whitelist zentral in `src/lib/abweichung-typen.ts`.
- **Fotos:** `Datei.auftragId` wird nullable; neue Bezüge `fuenfsPositionId`/`fuenfsBereichId` + raw-SQL-CHECK „genau ein Bezug“. Ist-Fotos je Audit-Position; Soll-Zustand-Fotos je Bereich als append-only Galerie (= Seiketsu-Versionierung, neuestes Foto = gültiger Standard). Rechte-Weiche in den Datei-Routen nach Bezug.
- **APIs** unter `/api/fuenfs/` (bereiche, checkliste, audits, positionen, trend): Lesen Recht `fuenfs`, Audit-Durchführung `fuenfs.audit`, Stammdaten `verwaltung`; Audit-Anlage friert die aktiven Checklisten-Punkte als Positionen ein; Autosave je Position (nur solange entwurf); Abschluss validiert (alles bewertet oder n. a.) und friert den Score ein.
- **UI:** Seite `/fuenfs` (Sidebar Sparkles) mit Tabs Audits | Trend (Linie je Bereich, 0–100 %) | Pareto (ParetoBlock mit abwTyp fuenfs) | Maßnahmen (Abweichungs-Liste mit Überfällig-Badge) | Standards (Foto-Galerien). Audit-Durchführung als **Tablet-Vollseite** `/fuenfs/audit/[id]`: 5 Abschnitte, große 0/1/2-Buttons, n. a., Bemerkung, Foto, Maßnahme — Autosave, Live-Score, abgeschlossen = read-only. **Erinnerung rein abgeleitet:** Dashboard-/Seiten-Banner „Audit ausstehend“ je Bereich ohne Audit im laufenden Monat (überfällig ab Vormonat) — kein Cron, keine Mails.

## Bewusst NICHT

Tägliche 5-Minuten-Routinen (Kap. 5: „sonst kippt 5S von Kultur zu Bürokratie“), eigenes Maßnahmen-Modell (CAPA-Vollausbau bleibt Ausbauidee), bereichsspezifische Vorlagen, Benachrichtigungs-Infrastruktur, Standard-Versions-Modell (Galerie ist die Versionierung), Soll/Ist-Bildvergleich, Punktgewichtung.

## Akzeptanzkriterien

- [ ] Monats-Audit je Bereich (Tablet): Punkte 0/1/2, n. a., Bemerkung, Foto; Abschluss friert Score ein; genau eins je Bereich+Monat
- [ ] Score 0/1 → Maßnahme als Abweichung typ fuenfs (Verantwortlicher, Termin, Überfällig-Badge), ohne Auftragsbezug
- [ ] Trend je Bereich über Monate + Pareto der 5S-Gründe
- [ ] Soll-Zustand-Fotos je Bereich (append-only Standard-Galerie)
- [ ] Dashboard erinnert an ausstehende Audits (abgeleitet, ohne Cron)
