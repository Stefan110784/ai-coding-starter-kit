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

<!-- Add features above this line -->

## Next Available ID: KF3-22

## Konventionen

- **Feature-IDs:** `KF3-X` (KIMA-Flow V3), fortlaufend. Bewusst eigenes Präfix, um Kollision mit der V2-Pipeline (`KIMA-X`) zu vermeiden.
- **Commits:** `feat(KF3-X): …`, `fix(KF3-X): …`
- **Status „In Progress" bedeutet hier:** Code ist gebaut und lokal lauffähig, aber noch **nicht** via `/qa` getestet und **nicht deployed**. Für formale Specs künftig `/write-spec KF3-X` nutzen.
- **Umfang aktuell:** 11 Seiten, 66 API-Routes, 21 Prisma-Modelle, 10 Feature-Komponenten.
</content>
