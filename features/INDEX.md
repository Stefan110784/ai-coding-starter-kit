# Feature Index

> Central tracking for all features. Updated by skills automatically.
> **Stand: 10.06.2026** – Initiale Erfassung des real implementierten Funktionsumfangs (Code-basiert). KIMA-Flow V3 wurde direkt entwickelt; es existieren noch keine formalen Spec-Dateien.

## Status Legend
- **Roadmap** - `/init` done, feature identified in feature map, no spec file yet
- **Planned** - `/write-spec` done, full spec written, architecture not yet designed
- **Architected** - `/architecture` done, tech design approved, ready to build
- **In Progress** - `/frontend` or `/backend` active or completed, not yet in QA
- **In Review** - `/qa` active, testing in progress
- **Approved** - `/qa` passed, no critical/high bugs, ready to deploy
- **Deployed** - `/deploy` done, live in production

## Features

| ID | Feature | Status | Spec | Created |
|----|---------|--------|------|---------|
| KF3-1 | Auth & Session – Login, Logout, Passwort ändern (iron-session + Argon2) | In Progress | – | 2026-06-09 |
| KF3-2 | Benutzer- & Rechteverwaltung – CRUD, Passwort-Reset, Rechte-Katalog (JSONB) | In Progress | – | 2026-06-09 |
| KF3-3 | Mitarbeiterverwaltung | In Progress | – | 2026-06-09 |
| KF3-4 | Aufträge – CRUD, Statusfluss, Positionen | In Progress | – | 2026-06-09 |
| KF3-5 | Arbeitsvorrat & Mitarbeiter-Zuweisung (Auftrags-Bucket, Zuweisungs-Übersicht) | In Progress | – | 2026-06-09 |
| KF3-6 | Zeiterfassung & Zeitkategorien | In Progress | – | 2026-06-09 |
| KF3-7 | Material & Lager – Bestände, Bewegungen, Entnahme, Lagerorte, Bedarf | In Progress | – | 2026-06-09 |
| KF3-8 | Stücklisten inkl. mehrstufigem Baum | In Progress | – | 2026-06-09 |
| KF3-9 | Inventur – rollierende Zählung buchen/verwerfen | In Progress | – | 2026-06-09 |
| KF3-10 | Kommissionierung & Checkliste | In Progress | – | 2026-06-09 |
| KF3-11 | Qualitätserfassung | In Progress | – | 2026-06-09 |
| KF3-12 | Auswertung & KPI-Dashboard inkl. CSV-Export + PDF-Bericht | In Progress | – | 2026-06-09 |
| KF3-13 | Beleg-Import aus AB-PDFs (inkl. Upload) | In Progress | – | 2026-06-09 |
| KF3-14 | Dateien & Fotos am Auftrag | In Progress | – | 2026-06-09 |
| KF3-15 | Barcode-Scanner (zxing) | In Progress | – | 2026-06-09 |
| KF3-16 | Packmaße am Auftrag | In Progress | – | 2026-06-09 |
| KF3-17 | Dashboard / Startübersicht | In Progress | – | 2026-06-09 |
| KF3-18 | Setup / Erstinstallation | In Progress | – | 2026-06-09 |
| KF3-19 | **Lieferantenverwaltung** – Stammdaten, Artikel-Lieferant-Zuordnung, Einkaufspreise *(NEU ggü. V2)* | In Progress | – | 2026-06-09 |
| KF3-20 | **EOQ-Berechnung** – optimale Bestellmenge *(NEU ggü. V2)* | In Progress | – | 2026-06-09 |
| KF3-21 | **Auftragsplanung / Timeline** – Mitarbeiter-Zuweisung mit Zeitfenstern (geplant_von/bis) *(NEU ggü. V2)* | In Progress | – | 2026-06-09 |
| KF3-22 | **Scanner-Durchgängigkeit** – iOS-Fix (Rückkamera, Stop+Feedback) + Scan-Input in Zeiten/Kommissionierung | In Progress | [Spec](KF3-22-scanner-durchgaengigkeit.md) | 2026-06-11 |
| KF3-23 | **Auftragspriorität + Tagesliste** – Prioritätsfeld, Arbeitsvorrat als sortierte Queue | In Progress | [Spec](KF3-23-auftragsprioritaet-tagesliste.md) | 2026-06-11 |
| KF3-24 | **Statusampel** – abgeleitete Ampel je Auftrag für Vertrieb/GF (Basis für CAS-Rückkanal) | In Progress | [Spec](KF3-24-statusampel.md) | 2026-06-11 |
| KF3-25 | **Audit-Historie** – generisches AuditEvent (Status, Notiz, Felder) + fehlende Benutzerstempel (ISO 7.5) | In Progress | [Spec](KF3-25-audit-historie.md) | 2026-06-11 |
| KF3-26 | **Endprüfung** – Pruefung-Modell + hartes Gate vor Auftragsabschluss (ISO 8.6) | In Progress | [Spec](KF3-26-endpruefung.md) | 2026-06-11 |
| KF3-27 | **Abweichung/Nacharbeit** – Minimal-CAPA mit Ursache/Maßnahme + Grund-Katalog (ISO 8.7, 10.2) | Roadmap | – | 2026-06-11 |
| KF3-28 | **Material-Snapshot am Auftrag** – eingefrorene Stücklisten-Auflösung bei Kommissionierung (ISO 7.5) | Roadmap | – | 2026-06-11 |
| KF3-29 | **Bestellwesen** – Bestellung/Position, Bestellvorschläge (EOQ+Meldebestand), Überfälligkeits-Ampel | Roadmap | – | 2026-06-11 |
| KF3-30 | **Wareneingang gegen Bestellung** – Soll-Ist-Abgleich, Teillieferung, Eingangsprüfung, Scanner | Roadmap | – | 2026-06-11 |
| KF3-31 | **Preishistorie** – ArtikelLieferantPreis append-only, Quelle manuell/Bestellung | Roadmap | – | 2026-06-11 |
| KF3-32 | **Lieferantenbewertung** – Termintreue + Qualität, rein abgeleitet (ISO 8.4) | Roadmap | – | 2026-06-11 |
| KF3-33 | **Materialreservierung** – Reservierung je Auftrag + Verfügbarkeitsprüfung beim Anlegen | Roadmap | – | 2026-06-11 |
| KF3-34 | **Pareto-Auswertungen** – Fehlteile + Nacharbeitsgründe (Grund-Katalog aus KF3-27) | Roadmap | – | 2026-06-11 |
| KF3-35 | **Zeiterfassungsgrad-KPI** – Soll-Anwesenheit + Abwesenheiten, nur Team/Monat (Zielkorridor 70–85 %) | Roadmap | – | 2026-06-11 |
| KF3-36 | **5S-Modul** – Monats-Audit mit Checkliste/Foto, Maßnahmen (CAPA), Trend | Roadmap | – | 2026-06-11 |
| KF3-37 | **Kundenauftrag-Modell** – Kunde + Kundenauftrag, Ende-zu-Ende-Liefertreue | Roadmap | – | 2026-06-11 |
| KF3-38 | **CAS-Sync Phase 1 (lesend)** – Staging, GUID-Mapping, Soft-Delete, Sync-Job (extern: API-Klärung) | Roadmap | – | 2026-06-11 |
| KF3-39 | **CAS-Rückkanal** – Status + bestätigter Termin zurück in die CAS-Kundenakte | Roadmap | – | 2026-06-11 |

<!-- Add features above this line -->

## Next Available ID: KF3-40

## Konventionen

- **Feature-IDs:** `KF3-X` (KIMA-Flow V3), fortlaufend. Bewusst eigenes Präfix, um Kollision mit der V2-Pipeline (`KIMA-X`) zu vermeiden.
- **Commits:** `feat(KF3-X): …`, `fix(KF3-X): …`
- **Status „In Progress" bedeutet hier:** Code ist gebaut und lokal lauffähig, aber noch **nicht** via `/qa` getestet und **nicht deployed**. Für formale Specs künftig `/write-spec KF3-X` nutzen.
- **Umfang aktuell:** 11 Seiten, 66 API-Routes, 21 Prisma-Modelle, 10 Feature-Komponenten.
</content>
