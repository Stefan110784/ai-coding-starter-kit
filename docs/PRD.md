# Product Requirements Document – KIMA-Flow V3

> **Erstentwurf: 10.06.2026** – abgeleitet aus dem bereits implementierten Funktionsumfang, der V3-Projektnotiz und den Erfahrungen aus KIMA-Flow V2. Verfeinern mit `/refine` oder direkt editieren.

## Vision

KIMA-Flow ist die interne Web-Anwendung zur **Produktionssteuerung und Betriebsdatenerfassung (BDE)** bei der KIMA Process Control GmbH. V3 ist der vollständige Neubau auf modernem, typsicherem Stack (Next.js 16, Prisma, PostgreSQL) und löst die gewachsene V2 ab.

Ziel ist **Transparenz in der Fertigung**: Wer arbeitet woran, welches Material ist vorhanden, wie lange dauern Aufträge wirklich – bei gleichzeitig wartbarer Codebasis. V3 erweitert den Funktionsumfang um **Einkauf/Beschaffung** (Lieferantenverwaltung, optimale Bestellmenge) und **Kapazitätsplanung** (Auftrags-Timeline).

## Target Users

- **Fertigungsmitarbeiter (Shop Floor)** – stempeln Zeiten, buchen Aufträge ein, kommissionieren, melden Qualität und Fertigstellung. Brauchen schnelle, einfache Bedienung, auch am Tablet/iPad (Barcode-Scan).
- **Fertigungs-/Abteilungsleiter** – Überblick über Auslastung, Auftragsstatus, KPIs und Materialbedarf; weist Aufträge zu und plant Kapazitäten.
- **Einkauf / Materialwirtschaft** – Lieferantenstammdaten, Einkaufspreise, optimale Bestellmengen (EOQ), Bestände.
- **Admin / Verwaltung** – verwaltet Benutzer, Rechte, Stammdaten, Stücklisten und Inventur.

**Pain Points, die V3 adressiert:**
- V2 (direktes SQL + Vanilla-JS) ist schwer wartbar und erweiterbar geworden.
- Es fehlten Module für echte Lieferanten-/Einkaufsverwaltung, Bestellmengenoptimierung und grafische Auftragsplanung.
- Wunsch nach typsicherer Codebasis (TypeScript + Prisma) und modernem, testbarem UI.

## Core Features (Roadmap)

> Detail- und Status-Tracking pro Modul in [`features/INDEX.md`](../features/INDEX.md) (`KF3-1 … KF3-21`). Alle Module sind aktuell **In Progress** (gebaut & lokal lauffähig, noch nicht via QA getestet / nicht deployed).

| Priorität | Funktionsbereich | Status |
|-----------|------------------|--------|
| P0 (MVP – Feature-Parität mit V2) | Auth & Rechte, Mitarbeiter, Aufträge, Arbeitsvorrat/Zuweisung, Zeiterfassung, Material & Lager, Stücklisten, Kommissionierung, Qualität, Dashboard, Beleg-Import, Dateien/Fotos, Auswertung & KPI inkl. CSV/PDF-Export, Setup | In Progress |
| P1 (Einkauf – neu in V3) | Lieferantenverwaltung, EOQ-Berechnung | In Progress |
| P1 (Lager/Erfassung) | Inventur, Packmaße, Barcode-Scanner | In Progress |
| P2 (Planung – neu in V3) | Auftragsplanung / Timeline mit Zeitfenstern | In Progress |

## Success Metrics

- V3 löst V2 auf dem Produktivsystem **ohne Funktionsverlust** ab.
- Alle aktiven Aufträge, Zeiten und Stammdaten werden korrekt aus V2 migriert (`migration/migrate_v2_to_v3.ts`).
- Mitarbeiter nutzen V3 im Tagesgeschäft (Akzeptanz, keine Rückfall-Nutzung von V2).
- Spürbar reduzierter Wartungsaufwand durch Typsicherheit + automatisierte Tests (Vitest/Playwright).
- _(Von Stefan zu ergänzen: konkrete messbare Ziele, z. B. Durchlaufzeit-Transparenz, Reduktion manueller Excel-Listen.)_

## Constraints

- **Einzelentwickler** (Stefan) neben einer Vollzeit-Führungsrolle → Entwicklung in Etappen, pragmatischer Scope.
- Muss im **KIMA-Firmennetz** laufen (On-Premise). Aktuell V2 auf Raspberry Pi (`10.100.82.109`); Deployment-Ziel für V3 noch offen (Pi / Docker / Vercel).
- **Datenschutz/intern:** Mitarbeiter- und Zeitdaten bleiben im Firmennetz – keine Cloud-Pflicht.
- Bedienung am Shop Floor auch per **Tablet** (responsive, Touch, Barcode).
- **Parallelbetrieb:** V2 bleibt produktiv, bis V3 nachweislich reif ist.

## Non-Goals

- Keine vollwertige ERP-/Buchhaltungs-Ablösung.
- Keine Mehrmandanten-/Mehrstandort-Architektur (vorerst ein Standort).
- Keine native Mobile-App (responsive Web genügt).
- Chargen-/Seriennummern-Verfolgung vorerst offen (Entscheidung aus V2 übernommen).
- Keine zwingende externe Cloud-Abhängigkeit.

---

Use `/write-spec KF3-X`, um für einzelne Module eine detaillierte Feature-Spezifikation zu erstellen.
</content>
