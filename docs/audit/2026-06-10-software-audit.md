# Software-Audit — KIMA-Flow V3

**Prüfgegenstand:** KIMA-Flow V3 — interne Web-Anwendung zur Produktionssteuerung & Betriebsdatenerfassung (BDE), KIMA Process Control GmbH
**Stack:** Next.js 16 (App Router), TypeScript, Prisma 7 (+ adapter-pg), PostgreSQL, iron-session/Argon2, Tailwind 3 + shadcn/ui
**Version / Stand:** `kima-flow-v3@1.0.0`, Commit `21a97bb`, Audit-Datum **2026-06-10**
**Prüfumfang:** Funktionsumfang · Usability · Design · Sicherheit
**Prüfmethode:** Statische Code-Analyse (vollständig) + Laufzeit-Stichproben (eingeschränkt, siehe unten)
**Fachliche Referenz:** IU-Kursbücher BWL I (BBWL01-01), BWL II (BBWL02-01, Lektion 2 Beschaffung/Lagerhaltung), KLR I (BKLR01-01, Lektion 3 Kostenartenrechnung)
**Scope-Hinweis:** **Reines Audit — es wurden keine Fixes vorgenommen.** Maßnahmen sind als priorisierte Roadmap dokumentiert.

> **Wichtige Einschränkung zur Prüftiefe:** Auf Wunsch des Auftraggebers wurden **keine aktiven Sicherheits-Laufzeittests** durchgeführt (keine Testbenutzer, keine Exploit-/Session-Proben). Alle Sicherheitsbefunde in Kapitel 7 sind daher **codebasiert (statisch)** und als solche gekennzeichnet — sie sind nicht durch einen Live-Angriff bestätigt, aber durch die jeweils zitierte Codestelle belegt. Zusätzlich relevant: Die laufende App ist **nicht** mit einer lokalen PostgreSQL verbunden (kein lokaler DB-Prozess; der App-Prozess hängt an einer Loopback-/Tunnel-Verbindung). Schreibende Laufzeittests wurden auch deshalb unterlassen, um produktive/entfernte Daten nicht zu gefährden.

---

## 1. Management Summary

KIMA-Flow V3 ist funktional bemerkenswert vollständig: Alle 21 geplanten Module (KF3-1…21) sind als Seite, API und Datenmodell vorhanden, der Stack ist modern und typsicher, und die Kern-Geschäftslogik (Stücklisten-Auflösung, anteilige Zeitaufteilung, EOQ, KPIs) ist sauber in testbare `lib/`-Funktionen ausgelagert. Das ist eine solide Grundlage und ein deutlicher Fortschritt gegenüber V2.

Der Reifegrad ist aber klar der eines **„In Progress"-Standes, noch nicht produktionsreif**. Die größten Lücken liegen nicht in fehlenden Features, sondern in **Sicherheits-Härtung**, **Eingabe-Validierung im UI** und **Betriebsreife** (Tests, Migrationen). Mehrere Schwächen verletzen die **projekteigenen Regeln** unter `.claude/rules/` (fehlende Security-Header, fehlendes Rate-Limiting, fehlende ARIA-Labels, fehlendes `.limit()`-Versprechen).

| Dimension | Bewertung | Kurzbegründung |
|-----------|-----------|----------------|
| **Funktionsumfang** | 🟢 Gut | Alle 21 Module implementiert; Geschäftslogik korrekt & getestet. Punktueller KPI-Zeitzonen-Bug, EOQ-Benennungsfehler, fachliche Ausbaupotenziale. |
| **Usability** | 🟡 Mittel | Konsistente shadcn-Oberfläche, aber keine Feld-Validierung (nur Toasts), Barcode-Scanner ohne Fallback (Shop-Floor-kritisch), keine Pagination. |
| **Design** | 🟡 Mittel | Permission-aware Navigation & Skeletons gut; Barrierefreiheit (ARIA/Focus-Trap) lückenhaft, ein Monolith-File (823 Z.), Tablet-Sheets problematisch. |
| **Sicherheit** | 🔴 Handlungsbedarf | Solides Fundament (Argon2, Zod, Auth-Checks), aber keine Security-Header, kein Rate-Limit, IDOR auf Datei-Downloads, hartcodiertes Initialpasswort — alle codebasiert belegt. |

**Die drei dringendsten Maßnahmen (Welle 1):**
1. **Security-Header + Rate-Limiting** ergänzen (verstößt aktuell gegen die eigene `security.md`).
2. **IDOR beheben** — Datei-/Foto-Download muss Auftrags-Zugehörigkeit/Recht prüfen.
3. **Hartcodiertes Initialpasswort** entfernen bzw. erzwungenen Wechsel + Login-Rate-Limit absichern.

---

## 2. Schweregrad- & Status-Modell

**Schweregrade** (Ausnutzbarkeit × Auswirkung, kalibriert für eine *interne, on-premise* Anwendung im Firmennetz):

| Grad | Bedeutung |
|------|-----------|
| 🔴 **Hoch** | Vertraulichkeits-/Integritätsverlust oder Shop-Floor-Blockade plausibel; zeitnah beheben. |
| 🟠 **Mittel** | Relevantes Risiko/Defizit unter bestimmten Bedingungen; einplanen. |
| 🟡 **Niedrig** | Geringe Auswirkung, Komfort/Konsistenz. |
| 🔵 **Hinweis** | Kein Defekt — Verbesserungs-/Ausbaupotenzial (oft fachlich aus den Kursbüchern). |

**Status der Verifikation** (jeder Befund trägt einen):
- **[codebasiert]** — durch zitierte Codestelle belegt, nicht per Live-Test bestätigt.
- **[laufzeitverifiziert]** — durch eine tatsächlich ausgeführte Stichprobe bestätigt.
- **[nicht testbar]** — nur logisch herleitbar (z. B. destruktiver Test bewusst unterlassen).

---

## 3. Geprüfte Umgebung & durchgeführte Stichproben

| Prüfung | Methode | Ergebnis |
|---------|---------|----------|
| Unit-Tests | `npm test` (vitest) | **64 Tests grün** in 3 Modulen (`zeit`, `stueckliste`, `beleg-parser`). *Hinweis:* vitest erfasst zusätzlich die Build-Kopien unter `.next/standalone/...` (kein Exclude) → Tests laufen doppelt. |
| Security-Header | `curl -sI http://localhost:3000/` | **Keine** CSP/X-Frame-Options/HSTS/X-Content-Type-Options gesetzt (bestätigt). |
| Server-/DB-Lage | `lsof`, `curl /api/setup` | App live auf `:3000`; **keine lokale PostgreSQL** (Loopback-/Tunnel-Verbindung); `setupRequired:false`. |
| EOQ-Rechnung | Handnachrechnung der Formel | Formel korrekt (s. 4.3); Benennungs-Hazard bestätigt. |
| KPI-Zeitzonenlogik | Code-Review `auswertung.ts` | Misch-Vergleich lokal/UTC bestätigt (s. 4.2). |
| Autorisierungs-Abdeckung | `grep` über 66 Routen | 61/66 mit Auth-Helper; 32/66 mit granularem `requireRecht`. |

**Bewusst nicht durchgeführt:** Aktive Security-Laufzeittests (IDOR-Exploit, Brute-Force-Probe, Session-Invalidierung, Reset→Login), Browser-Screenshots der authentifizierten Seiten, CSV/PDF-Export-Download — alle erfordern einen Login bzw. schreibende DB-Operationen, die auf Wunsch und wegen der nicht-lokalen DB unterblieben sind.

---

## 4. Dimension 1 — Funktionsumfang

### 4.1 Abdeckung der 21 Module

Alle in `features/INDEX.md` geführten Module (KF3-1…21) sind real implementiert — durchgängig mit Seite, API-Route(n) und Prisma-Modell. Umfang: **11 Seiten, 66 API-Routes, 21 Prisma-Modelle, 10 Feature-Komponenten**. Keine Stubs/TODOs/„coming soon" gefunden. Stärken im Detail:

- **Saubere Schichtung:** Geschäftslogik in `src/lib/` (z. B. `stueckliste.ts`, `zeit.ts`, `auswertung.ts`, `eoq.ts`), Routen dünn. Das macht die Logik testbar — und sie *ist* getestet.
- **Anspruchsvolle Logik korrekt umgesetzt:** mehrstufige Stücklisten-Nettobedarfsrechnung mit Zyklus-Erkennung und Pruning (`stueckliste.ts`), anteilige Zeitaufteilung bei Parallelarbeit inkl. Nachträgen/Korrekturen (`zeit.ts`) — beide mit Unit-Tests abgedeckt.
- **V3-Neuerungen vorhanden:** Lieferantenverwaltung, EOQ, Auftrags-Timeline (`planung`).

**Funktionale Lücken / Reifegrad:**

| ID | Befund | Grad | Status |
|----|--------|------|--------|
| F-1 | **KPI-Liefertreue vergleicht lokales mit UTC-Datum** (s. 4.2) | 🟠 Mittel | [codebasiert] |
| F-2 | **EOQ: irreführende Feld-/Param-Benennung + fehlende Andler-Herleitung** (s. 4.3) | 🟠 Mittel | [codebasiert] |
| F-3 | **Testabdeckung schmal:** nur 3 reine Logik-Module getestet; keine Tests für `eoq`, `auswertung`/KPI, Auth, oder API-Routen; **keine E2E-Specs** (Playwright konfiguriert, aber kein `tests/`-Verzeichnis). vitest läuft zudem doppelt über `.next`-Kopien. | 🟠 Mittel | [laufzeitverifiziert] |
| F-4 | **Betriebsreife Datenbank:** kein `prisma/migrations/`-Verzeichnis — Schema via `db push`/Skripte statt versionierter Migrationen; `prisma migrate deploy` im Dockerfile läuft damit ins Leere. | 🟠 Mittel | [codebasiert] |
| F-5 | **Setup minimal:** `/api/setup` legt nur den Admin an; keine geführte Erst-Konfiguration (Lagerorte, Zeitkategorien, Rollen). | 🟡 Niedrig | [codebasiert] |
| F-6 | **PDF-/CSV-Export & Beleg-Bulk-Import** nicht unter Last verifiziert (kein Login durchgeführt). | 🟡 Niedrig | [nicht testbar] |

### 4.2 Korrektheits-Befund: KPI-Zeitzonenvergleich (F-1)

In `src/lib/auswertung.ts:208-212` wird die Liefertreue so berechnet:

```ts
const onTime = mitTermin.filter(
  (a) => lokalDatum(a.ende as Date) <= utcDatum(a.promisedDate as Date)
).length;
```

`lokalDatum()` formatiert in **Europe/Berlin** (`:11-13`), `utcDatum()` in **UTC** (`:15-17`). Es werden also zwei in **unterschiedlichen Zeitzonen** gebildete Datums-Strings verglichen. An Tagesgrenzen (Aufträge, die spätabends fertig werden) kann das zu einem **Off-by-one-Tag** führen — ein Auftrag gilt fälschlich als zu spät oder zu früh. Dieselbe Mischung tritt bei der Wochen-Zuordnung auf (`auftraegeInWoche`, `:259-268`: Wochengrenzen via `utcDatum`, Auftragsdatum via `lokalDatum`).

**Empfehlung:** Durchgängig eine Zeitzone für Datumsvergleiche verwenden (konsistent `lokalDatum` für beide Seiten, da Liefertermine fachlich lokale Kalendertage sind). Ergänzend einen Unit-Test für die Tagesgrenze.

### 4.3 Fachlicher Abgleich EOQ ↔ Andler-Modell (BWL II, Lektion 2) (F-2)

Die App rechnet die optimale Bestellmenge in `src/lib/eoq.ts:6-9`:

```ts
// EOQ = sqrt(2 * D * S / H)   —  H = "Lagerkostensatz pro Einheit/Jahr"
return Math.sqrt((2 * D * S) / H);
```

Das ist die **Wilson-/Andler-Formel** und **mathematisch korrekt**, *sofern* `H` die absoluten Lagerhaltungskosten **pro Stück und Jahr** (in €) sind. Das UI-Label ist hier sogar richtig: **„Lagerkosten €/Stk/J"** (`lieferanten/page.tsx:188`).

**Das Problem ist die Inkonsistenz dahinter:**
- Das Feld heißt überall `lagerkostensatz` — ein **„-satz"** suggeriert einen **Prozentsatz**, nicht einen €-Betrag (`prisma/schema.prisma:424`, API-Parameter in `api/lieferanten/eoq/route.ts`, Formstate in `lieferanten/page.tsx:45/86`).
- Der Schema-Kommentar (`schema.prisma:422`) wiederholt die Formel ohne Einheit, der Code-Kommentar in `eoq.ts:4` nennt es widersprüchlich „**Lagerkostensatz** pro Einheit/Jahr" — „Satz" und „pro Einheit/Jahr" zugleich.

Das IU-Lehrbuch (BWL II, Lektion 2, „Grundmodell der optimalen Bestellmenge") leitet die Lagerhaltungskosten aus **Einkaufspreis × Lagerzinssatz** her — die klassische Andler-Form `x_opt = √(2·D·S / (p·i))`. Die App **speichert den `einkaufspreis` bereits** (`schema.prisma:420`), nutzt ihn in der EOQ-Berechnung aber **nicht** — der Anwender muss `H = p·i` selbst vorab ausrechnen.

**Demonstration des Eingabe-Hazards** (Lehrbuch-nahes Beispiel D=12.000, S=100 €):

| Eingabe in „lagerkostensatz" | Interpretation | Ergebnis EOQ | korrekt? |
|------------------------------|----------------|--------------|----------|
| `2` (= 2 €/Stk/J, UI-Label-konform) | absoluter Betrag | √(2·12000·100/2) = **≈ 1.095 Stk** | ✅ |
| `0,2` (gelesen als „20 % Satz") | Prozentsatz | √(2·12000·100/0,2) = **≈ 3.464 Stk** | ❌ unsinnig |

Wer der Feldbezeichnung „-satz" folgt, erhält ein um Faktor ~3 falsches Ergebnis — ohne Fehlermeldung.

**Empfehlung:** Feld in `lagerkostenProStueck` umbenennen **oder** echte Andler-Herleitung implementieren (`H = einkaufspreis × Lagerzinssatz%`), mit getrenntem Prozent-Eingabefeld und konsistenten Labels in UI, API und Schema.

### 4.4 Fachliche Ausbaupotenziale aus den Kursbüchern

| ID | Potenzial | Grad | Quelle |
|----|-----------|------|--------|
| F-7 | **Lagerkennzahlen fehlen komplett.** BWL II definiert durchschnittlichen Lagerbestand, **Lagerumschlagshäufigkeit** (= Jahresverbrauch / Ø-Bestand), **durchschnittliche Lagerdauer** (= 360 / Umschlag) und **Lagerzinssatz**. Die Daten dafür liegen in `Materialbewegung` (`schema.prisma:338`) bereits vor; die `Kpi`-Schnittstelle (`auswertung.ts:176-184`) führt keine davon. Ein „Lager-Kennzahlen"-Block im Auswertungs-Dashboard wäre mit vorhandenen Daten umsetzbar und fachlich hochrelevant für Einkauf/Materialwirtschaft. | 🔵 Hinweis | BWL II, Lektion 2 |
| F-8 | **Materialbewegungen ohne Bewertung (Skontrationsmethode unvollständig).** Das Modell `Materialbewegung`/Entnahme entspricht konzeptionell exakt der **Skontrationsmethode** (Materialentnahmescheine) aus KLR I — Datum, Materialnummer, Verbrauchsmenge sind vorhanden. Es fehlen aber (a) eine **Bewertung** (kein Preis an der Bewegung → keine Materialkostenrechnung nach Festpreis/Istpreis bzw. FIFO/LIFO/gleitendem Durchschnitt möglich) und (b) **Kostenstelle/Kostenträger** je Entnahme. Damit lässt sich der Materialverbrauch mengenmäßig, aber nicht **wertmäßig** auswerten. | 🔵 Hinweis | KLR I, Lektion 3 |

Diese beiden Punkte sind **keine Mängel**, sondern naheliegende, fachlich fundierte Erweiterungen, die KIMA-Flow vom reinen BDE-Tool näher an eine Einkaufs-/Kostencontrolling-Funktion heranführen.

---

## 5. Dimension 2 — Usability

**Stärken:** Durchgängige, aufgeräumte shadcn/ui-Oberfläche; Karten-Layout; Skeletons für Ladezustände; Sonner-Toasts für Feedback; deutsche Lokalisierung ohne englische Reste; rollenabhängige Navigation; ein dedizierter „Arbeitsvorrat"-Bucket mit großen Ein-/Ausstempeln-Buttons (gut für den Shop Floor).

| ID | Befund | Grad | Status |
|----|--------|------|--------|
| U-1 | **Keine Feld-Validierung im UI.** Formulare nutzen rohes `useState` statt `react-hook-form` + Zod; Fehler erscheinen ausschließlich als (flüchtiger) Toast, **nie feldbezogen** unter dem Eingabefeld. Pflichtfeld-Markierung uneinheitlich. Pflicht-/Server-Validierung greift erst beim Absenden. | 🟠 Mittel | [codebasiert] |
| U-2 | **Barcode-Scanner ohne Fallback (Shop-Floor-kritisch).** In `barcode-scanner.tsx:48` wird jeder Kamerafehler still verschluckt (`.catch(() => {})`); es gibt **keinen Fehlerstatus, keine Berechtigungs-Aufforderung und keine manuelle Code-Eingabe**. Bei verweigerter Kamera (typisch auf iPad/Tablet) bleibt nur ein schwarzes Bild mit „Kamera auf Barcode richten" (`:75-77`) — eine Sackgasse. | 🔴 Hoch | [codebasiert] |
| U-3 | **Keine Pagination.** Bewegungsliste auf 100, Zeitenliste auf 50 Einträge begrenzt, ohne Blättern/Filter-Hinweis — Daten „verschwinden" ab der Grenze lautlos. (Widerspricht zugleich `backend.md`: „Use `.limit()` on all list queries" ist zwar erfüllt, aber ohne UI-seitige Fortsetzung.) | 🟠 Mittel | [codebasiert] |
| U-4 | **Verschachtelte Sheets blockieren Navigation am Tablet.** Bei geöffnetem Auftrags-Detail-Sheet ist die Sidebar verdeckt/unerreichbar; Modulwechsel erfordert erst Schließen. | 🟠 Mittel | [codebasiert] |
| U-5 | **Locale-Inkonsistenzen.** Keine Tausendertrennzeichen (de-DE) bei Mengen/Preisen („1000" statt „1.000"); uneinheitliche Zeitformate („45m" vs. „45 min"). | 🟡 Niedrig | [codebasiert] |
| U-6 | **Navigations-Flicker.** Vor Auflösen von `use-me` wird kurz die **vollständige** Navigation gezeigt, dann nach Rechten gefiltert (`app-sidebar.tsx`) — kurzzeitig sichtbare, nicht erlaubte Menüpunkte. | 🟡 Niedrig | [codebasiert] |

---

## 6. Dimension 3 — Design & Code-Struktur

**Stärken:** Konsequente Wiederverwendung der shadcn/ui-Primitives (keine Eigenbauten von Button/Dialog/Table), einheitliches `confirm-dialog`-Muster für destruktive Aktionen, definierte Status-Badges mit Farbe **und** Text (nicht nur farbcodiert), `error.tsx`/`not-found.tsx` vorhanden.

| ID | Befund | Grad | Status |
|----|--------|------|--------|
| D-1 | **Barrierefreiheit lückenhaft** — entgegen `frontend.md` („Use semantic HTML and ARIA labels"): Icon-only-Buttons (Scanner, Bearbeiten, Löschen) ohne `aria-label`; **kein Focus-Trap** in Sheets/Dialogen (Tab springt hinter das Overlay); kein durchgängiger `:focus-visible`-Ring. | 🟠 Mittel | [codebasiert] |
| D-2 | **Monolithische Seite.** `verwaltung/page.tsx` mit **823 Zeilen** vereint Benutzer, Mitarbeiter, Lagerorte, Zeitkategorien und Import in einer Datei — Wartbarkeits-/Review-Risiko. Auch `material/page.tsx` (~798 Z.) und `auftraege/page.tsx` (~660 Z.) sind sehr groß. | 🟠 Mittel | [codebasiert] |
| D-3 | **Uneinheitliche Muster.** „Anlegen" mal als Dialog, mal inline; Empty-State-Texte je Seite unterschiedlich formuliert; teils lockere Typisierung (`data as any` aus SWR). | 🟡 Niedrig | [codebasiert] |

---

## 7. Dimension 4 — Sicherheit

> Alle Befunde dieses Kapitels sind **[codebasiert]** — sie sind durch die zitierte Codestelle belegt, aber auf Wunsch **nicht durch aktive Laufzeittests** verifiziert. Schweregrade sind für eine *interne, on-premise* Anwendung kalibriert; in einem exponierten Netz wären mehrere eine Stufe höher einzuordnen.

**Solides Fundament (verifizierte Stärken):** Passwörter mit **Argon2** gehasht; Eingaben mit **Zod** validiert (auch in den 5 „auth/setup"-Routen, die bewusst ohne den generischen Auth-Helper arbeiten); 61/66 Routen mit Auth-Prüfung, 32 davon mit granularem Recht; **Path-Traversal korrekt abgewehrt** (`storage.ts` `absolutPfad`/`sichererName` — verifizierter **Nicht-Befund**); keine Roh-SQL (`$queryRaw`/`$executeRaw`) im Code; PDF-Parsing lokal via `pdfjs-dist`, kein `eval`.

| ID | Titel | Grad | Status |
|----|-------|------|--------|
| **S-1** | **Keine Security-Header & kein CSRF-Schutz** | 🔴 Hoch | [codebasiert] |
| **S-2** | **Hartcodiertes Initialpasswort `kima2026`** | 🔴 Hoch | [codebasiert] |
| **S-3** | **IDOR: Datei-/Foto-Download ohne Zugehörigkeitsprüfung** | 🔴 Hoch | [codebasiert] |
| **S-4** | **Kein Rate-Limiting / Brute-Force-Schutz am Login** | 🔴 Hoch | [codebasiert] |
| **S-5** | **Deaktivierte Benutzer behalten gültige Session** | 🟠 Mittel | [codebasiert] |
| **S-6** | **Passwortwechsel invalidiert andere Sessions nicht** | 🟠 Mittel | [codebasiert] |
| **S-7** | **Setup-Route bei leerer Benutzertabelle re-ausführbar** | 🟠 Mittel | [nicht testbar] |
| **S-8** | **Upload vertraut Client-MIME; Download `inline`** | 🟠 Mittel | [codebasiert] |
| **S-9** | **Foto-Upload ohne granulares Recht** | 🟡 Niedrig | [codebasiert] |

---

### S-1 — Keine Security-Header & kein CSRF-Schutz 🔴
**Beweis:** `src/middleware.ts:7-24` setzt keinerlei Header und prüft nur die Token-Existenz; `next.config.ts` enthält keine `headers()`-Funktion (verifiziert). `curl -sI http://localhost:3000/` liefert weder CSP noch X-Frame-Options, X-Content-Type-Options, Referrer-Policy oder HSTS. Cookie ist `SameSite=Lax`, es gibt keine CSRF-Tokens/Origin-Prüfung.
**Auswirkung:** Clickjacking (kein `X-Frame-Options`/`frame-ancestors`), MIME-Sniffing, kein erzwungenes HTTPS. **Verstößt direkt gegen die projekteigene `.claude/rules/security.md`**, die X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy und HSTS *vorschreibt*.
**Empfehlung:** Header zentral in `next.config.ts` (`async headers()`) oder Middleware setzen; für state-ändernde Routen Origin-/CSRF-Prüfung ergänzen.

### S-2 — Hartcodiertes Initialpasswort 🔴
**Beweis:** `src/lib/auth.ts:6` `INITIAL_PASSWORT = "kima2026"`, verwendet für neue Benutzer und Passwort-Resets. Der Wert steht im Klartext im Quellcode (und in der Git-Historie) und ist aus V2 bekannt.
**Auswirkung:** Jeder neue/zurückgesetzte Account ist bis zum ersten Wechsel mit einem bekannten Passwort übernehmbar — besonders in Kombination mit S-4 (kein Rate-Limit).
**Empfehlung:** Initialpasswort pro Account zufällig generieren und einmalig anzeigen/aushändigen; erzwungenen Wechsel beim ersten Login sicherstellen (`mussPasswortAendern`); Konstante aus dem Quellcode entfernen.

### S-3 — IDOR auf Datei-/Foto-Download 🔴
**Beweis:** `src/app/api/dateien/[id]/route.ts:8-13` ruft nach `requireAuth` direkt `dateiDownloadResponse(id)` auf — **ohne** zu prüfen, ob der angemeldete Benutzer zum zugehörigen Auftrag berechtigt ist; `src/lib/dateien.ts` enthält keine Zugehörigkeits-/Rechteprüfung beim Download.
**Auswirkung:** Jeder eingeloggte Benutzer kann durch Erraten/Enumerieren einer Datei-`id` **beliebige Anhänge/Fotos fremder Aufträge** abrufen (Vertraulichkeitsbruch quer durch alle Aufträge). Dasselbe Muster für Fotos.
**Empfehlung:** Vor dem Ausliefern prüfen, ob der Benutzer dem Auftrag zugewiesen ist bzw. das passende Recht hat; ggf. Download auf berechtigte Rollen einschränken.

### S-4 — Kein Rate-Limiting am Login 🔴
**Beweis:** `src/app/api/auth/login/route.ts` enthält keinen Zähler, keine Verzögerung und keine Sperre; ebenso keine Maßnahme gegen Timing-Unterschiede (existierender vs. nicht-existierender Benutzer).
**Auswirkung:** Unbegrenztes Passwort-Raten möglich — mit S-2 (bekanntes Default) und potenziell schwachen Passwörtern real ausnutzbar. **Verstößt gegen `.claude/rules/security.md`** („Implement rate limiting on authentication endpoints").
**Empfehlung:** IP-/Account-basiertes Rate-Limit + exponentielles Backoff oder temporäre Sperre nach N Fehlversuchen.

### S-5 — Deaktivierte Benutzer behalten Session 🟠
**Beweis:** `src/lib/session.ts:20-35` (`getSession`) prüft nur Token-Existenz und Ablauf (`laeuftAb`), **nicht** das `aktiv`-Flag des Benutzers — anders als `authenticateUser` (`auth.ts:28`), das beim Login `aktiv` prüft.
**Auswirkung:** Ein deaktivierter Benutzer kann seine bestehende Session bis zu **8 Stunden** (TTL, `session.ts:5`) weiternutzen.
**Empfehlung:** In `getSession` zusätzlich `benutzer.aktiv` prüfen und inaktive Sessions verwerfen.

### S-6 — Passwortwechsel invalidiert andere Sessions nicht 🟠
**Beweis:** `src/lib/session.ts` bietet keine „alle anderen Sessions löschen"-Operation; der Passwort-Endpunkt aktualisiert nur den Hash.
**Auswirkung:** Eine kompromittierte Parallel-Session bleibt nach dem Passwortwechsel gültig.
**Empfehlung:** Bei Passwortwechsel/-reset alle übrigen Sessions des Benutzers löschen.

### S-7 — Setup re-ausführbar bei leerer Benutzertabelle 🟠
**Beweis:** `/api/setup` ist öffentlich (`middleware.ts:5`) und gibt sich nur frei, wenn `Benutzeranzahl > 0` als Sperre dient (`api/setup/route.ts`). **Nur logisch hergeleitet (nicht live getestet — destruktiv):** Würden je alle `Benutzer` gelöscht, würde die öffentliche Route wieder zur unauthentifizierten Admin-Erstellung.
**Empfehlung:** Setup zusätzlich über ein persistentes „initialisiert"-Flag (eigene Konfigtabelle/Migration) absichern, nicht allein über die Benutzerzahl.

### S-8 — Client-MIME vertraut, Download `inline` 🟠
**Beweis:** `src/lib/dateien.ts` übernimmt den vom Client gemeldeten MIME-Typ (Whitelist auf `file.type`, fälschbar) und liefert Downloads mit `Content-Disposition: inline`.
**Auswirkung:** Eine als Bild getarnte HTML/SVG-Datei könnte im Browser **inline** im selben Origin gerendert werden → Stored-XSS-Vektor.
**Empfehlung:** MIME serverseitig aus dem Dateiinhalt bestimmen; nicht vertrauenswürdige Typen mit `Content-Disposition: attachment` und restriktiver CSP ausliefern.

### S-9 — Foto-Upload ohne granulares Recht 🟡
**Beweis:** `src/app/api/fotos/route.ts` (POST) nutzt nur `requireAuth`, kein `requireRecht`; jeder eingeloggte Benutzer kann zu jedem Auftrag Fotos hochladen.
**Empfehlung:** Auf das passende Recht/Auftrags-Zugehörigkeit einschränken (analog zu den schreibenden Material-/Auftragsrouten).

---

## 8. Findings-Gesamtübersicht

| ID | Dimension | Titel | Grad | Status | Aufwand |
|----|-----------|-------|------|--------|---------|
| S-1 | Sicherheit | Keine Security-Header / kein CSRF | 🔴 Hoch | codebasiert | S |
| S-2 | Sicherheit | Hartcodiertes Initialpasswort | 🔴 Hoch | codebasiert | S |
| S-3 | Sicherheit | IDOR Datei-/Foto-Download | 🔴 Hoch | codebasiert | M |
| S-4 | Sicherheit | Kein Login-Rate-Limit | 🔴 Hoch | codebasiert | M |
| U-2 | Usability | Barcode-Scanner ohne Fallback | 🔴 Hoch | codebasiert | M |
| F-1 | Funktion | KPI-Zeitzonen-Vergleich | 🟠 Mittel | codebasiert | S |
| F-2 | Funktion | EOQ-Benennung/Andler-Herleitung | 🟠 Mittel | codebasiert | M |
| F-3 | Funktion | Schmale Testabdeckung / keine E2E | 🟠 Mittel | laufzeitverifiziert | M |
| F-4 | Funktion | Keine versionierten Migrationen | 🟠 Mittel | codebasiert | M |
| S-5 | Sicherheit | Inaktive behalten Session | 🟠 Mittel | codebasiert | S |
| S-6 | Sicherheit | PW-Wechsel ohne Session-Invalidierung | 🟠 Mittel | codebasiert | S |
| S-7 | Sicherheit | Setup re-ausführbar | 🟠 Mittel | nicht testbar | S |
| S-8 | Sicherheit | MIME-Trust / inline-Download | 🟠 Mittel | codebasiert | M |
| U-1 | Usability | Keine Feld-Validierung | 🟠 Mittel | codebasiert | M |
| U-3 | Usability | Keine Pagination | 🟠 Mittel | codebasiert | M |
| U-4 | Usability | Tablet-Sheets blockieren Nav | 🟠 Mittel | codebasiert | M |
| D-1 | Design | Barrierefreiheit (ARIA/Focus) | 🟠 Mittel | codebasiert | M |
| D-2 | Design | Monolith `verwaltung/page.tsx` | 🟠 Mittel | codebasiert | L |
| S-9 | Sicherheit | Foto-Upload ohne Recht | 🟡 Niedrig | codebasiert | S |
| F-5 | Funktion | Setup minimal | 🟡 Niedrig | codebasiert | M |
| F-6 | Funktion | Export/Import nicht lastgeprüft | 🟡 Niedrig | nicht testbar | S |
| U-5 | Usability | Locale-Inkonsistenzen | 🟡 Niedrig | codebasiert | S |
| U-6 | Usability | Navigations-Flicker | 🟡 Niedrig | codebasiert | S |
| D-3 | Design | Uneinheitliche Muster / `any` | 🟡 Niedrig | codebasiert | M |
| F-7 | Funktion | Lagerkennzahlen ergänzen (BWL II) | 🔵 Hinweis | — | M |
| F-8 | Funktion | Materialbewertung ergänzen (KLR I) | 🔵 Hinweis | — | L |

*Aufwand: S = Stunden/≤1 Tag · M = Tage · L = > 1 Woche.*

---

## 9. Priorisierte Maßnahmen-Roadmap

### Welle 1 — Sofort (Sicherheits-Härtung, betroffene Dateien klein)
1. **S-1** Security-Header + (HSTS/CSP/X-Frame-Options/nosniff/Referrer-Policy) in `next.config.ts`/`middleware.ts`; CSRF-Origin-Check. *(S)*
2. **S-3** Zugehörigkeits-/Rechteprüfung in `dateien/[id]/route.ts` + `fotos` vor Download/Upload. *(M)*
3. **S-2 + S-4** Initialpasswort entzufallen + erzwungener Wechsel; Login-Rate-Limit. *(M)*
4. **F-1** KPI-Datumsvergleich auf eine Zeitzone vereinheitlichen + Tagesgrenzen-Test. *(S)*

### Welle 2 — Kurzfristig (1–2 Wochen)
5. **S-5/S-6** `getSession` prüft `aktiv`; Passwortwechsel löscht andere Sessions. *(S)*
6. **S-7** Setup über persistentes Init-Flag absichern. *(S)*
7. **S-8** MIME serverseitig prüfen, `attachment`-Disposition für untrusted Typen. *(M)*
8. **U-1** `react-hook-form` + Zod mit feldbezogenen Fehlern (zentrale Form-Komponente). *(M)*
9. **U-2** Barcode-Scanner: Fehlerstatus + manuelle Code-Eingabe als Fallback. *(M)*
10. **D-1** ARIA-Labels an Icon-Buttons; Focus-Trap in Sheets/Dialogen. *(M)*
11. **F-3** Tests für `eoq`/`auswertung`, erste Playwright-E2E (Login, Stempeln, Auftrag anlegen); `.next` aus vitest-`exclude`. *(M)*

### Welle 3 — Mittelfristig (Reife & Fachausbau)
12. **F-2** EOQ-Feld umbenennen/echte Andler-Herleitung (`H = Preis × Zinssatz`). *(M)*
13. **F-7** Lager-Kennzahlen-Block (Umschlag, Lagerdauer, Lagerzinssatz) im Auswertungs-Dashboard. *(M)*
14. **F-8** Bewertung + Kostenstelle/Kostenträger an `Materialbewegung` → Materialkostenrechnung. *(L)*
15. **F-4** Versionierte `prisma migrate`-Workflows etablieren. *(M)*
16. **D-2 + U-3/U-4** `verwaltung` modularisieren; Pagination; Tablet-Sheet-Verhalten. *(L)*

---

## 10. Anhang

### 10.1 Testprotokoll (durchgeführt)
- `npm test` → 64 Tests grün (3 Module; vitest erfasst zusätzlich `.next/standalone`-Kopien).
- `curl -sI http://localhost:3000/` → keine Security-Header (S-1 bestätigt).
- `curl http://localhost:3000/api/setup` → `{"setupRequired":false}`; `/` → 307 → `/login`.
- `lsof`/`pgrep` → kein lokaler PostgreSQL-Prozess; App-Prozess auf Loopback-Verbindung (Tunnel/Proxy).
- `grep` über 66 Routen → 61 mit Auth-Helper, 32 mit `requireRecht`; 5 ohne Helper sind login/setup (öffentlich) bzw. me/passwort/logout (via `getSession`).
- Handnachrechnung EOQ (D=12000, S=100): H=2 → ≈1095, H=0,2 → ≈3464 (Eingabe-Hazard bestätigt).

### 10.2 Bewusst nicht durchgeführt (mit Begründung)
- **Aktive Security-Laufzeittests** (IDOR-Exploit, Brute-Force, Session-/Reset-Proben): auf Wunsch des Auftraggebers ausgelassen; Befunde codebasiert belegt.
- **Authentifizierte UI-Screenshots & Export-Downloads**: erfordern Login; nicht durchgeführt.
- **Keine schreibenden DB-Operationen / keine Testbenutzer angelegt** → kein Teardown nötig; Datenbestand unverändert.

### 10.3 Verifizierte Nicht-Befunde
- **Path-Traversal** bei Datei-Zugriff korrekt abgewehrt (`src/lib/storage.ts`, `absolutPfad`/`sichererName`).
- **Keine Roh-SQL** (`$queryRaw`/`$executeRaw`) im Code; alle DB-Zugriffe über Prisma.
- **Eingabevalidierung serverseitig** mit Zod in den API-Routen vorhanden (UI-Validierung ist die Lücke, nicht der Server).

### 10.4 Referenzierte Projektregeln (Eigenverstöße)
- `.claude/rules/security.md` — fordert Security-Header (S-1) und Rate-Limiting (S-4); beide nicht erfüllt.
- `.claude/rules/frontend.md` — fordert ARIA-Labels/State-Handling (D-1, U-1).
- `.claude/rules/backend.md` — `.limit()` auf Listen erfüllt, aber ohne UI-Pagination (U-3).

---

*Erstellt im Rahmen eines Audit-Reviews am 2026-06-10. Kein Code wurde verändert. Sicherheitsbefunde sind codebasiert und sollten vor einem Produktiv-Deployment durch gezielte Laufzeittests (oder `/qa`) bestätigt und behoben werden.*
