# KF3-25: Audit-Historie + Benutzerstempel

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 1 (ISO 9001 Kap. 7.5: „Benutzer- und Zeitstempel auf jeder Buchung, lückenlose Historie statt überschreibbarer Felder")

## Problem

Auftrags-Statuswechsel und Notizen wurden überschrieben — kein Wer/Wann nachvollziehbar. Datei-Uploads und Qualitätseinträge hatten keinen Erfasser-Stempel.

## Entscheidung: generisches `AuditEvent` statt Historientabellen je Entität

Eine Tabelle + ein Helper deckt Status, Notiz und künftige Stammdaten-Audits ab. Bewusst **ohne FK auf die Zielentität**: Der Nachweis überlebt das Löschen des Auftrags (Cascade vernichtet sonst alle Qualitäts-/Zeitdaten — das Audit-Event bleibt als einziger Beleg). `aktion`/`feld` als String statt Enum, damit neue Audit-Quellen keine Migration brauchen.

## Umsetzung

- **Schema:** `AuditEvent` (entitaet, entitaetId, aktion, feld, altWert, neuWert, kontext JSONB, benutzerId, zeitstempel; Indizes auf [entitaet, entitaetId] + zeitstempel). Benutzerstempel: `Auftrag.erstelltVonId`, `Datei.hochgeladenVonId`, `Qualitaet.erfasstVonId` (alle nullable → Altdaten zeigen „–"). Migration `20260611133611_audit_event_und_benutzerstempel`.
- **Helper `src/lib/audit.ts`:** `auditEintrag(db, e)` (läuft in Transaktionen via `Db`-Typ aus `bestand.ts`), `feldDiffs(...)` (pur, getestet), `auditFeldDiff(...)`. Tests in `audit.test.ts`.
- **Schreibstellen:**
  - `PATCH /api/auftraege/[id]`: „statuswechsel" (mit `force`-Kontext) + Feld-Diffs über alle editierbaren Felder — in derselben Transaktion wie das Update.
  - `POST /api/auftraege`: „erstellt" + `erstelltVonId`.
  - `DELETE /api/auftraege/[id]`: „geloescht" mit Auftragskopf im Kontext, VOR dem Cascade-Delete.
  - Datei-Upload (`/api/dateien`, `/api/fotos` → `legeDateiAn`): `hochgeladenVonId`. Beleg-Import bleibt bewusst NULL (`quelle: "beleg"` dokumentiert die automatische Herkunft).
  - Beleg-Import (`verarbeiteBeleg`): „erstellt"-Event + Feld-Diffs auch für Import-Updates (benutzerId NULL = Systemlauf) — der Import läuft nicht mehr am Log vorbei (Review-Befund). Auch die AUTO-Ableitung von `promisedDate` aus dem Liefertermin wird protokolliert.
  - `POST /api/qualitaet`: `erfasstVonId`.
- **Lesen:** `GET /api/audit?entitaet=&entitaetId=` (je Entität für Angemeldete; Gesamtauszug nur mit Verwaltungs-Recht). UI: Tab „Verlauf" im Auftrags-Sheet (`src/components/auftrag-verlauf.tsx`).

## Akzeptanzkriterien

- [x] Jeder Statuswechsel erzeugt ein Event mit Benutzer + Zeit + alt/neu (inkl. force-Kommissionierung)
- [x] Notiz-/Feldänderungen historisiert (löst auch „Notiz wird überschrieben")
- [x] Auftrags-Löschung hinterlässt einen bleibenden Nachweis
- [x] Upload/Qualität mit Benutzerstempel; Altdaten unverändert (NULL)

## Später

Gleicher Helper in Artikel-/Lieferanten-Routen (Preis, Mindestbestand) — je 2–3 Zeilen pro Route. Bestellstatus-Wechsel (KF3-29) nutzen den Helper von Tag 1.
