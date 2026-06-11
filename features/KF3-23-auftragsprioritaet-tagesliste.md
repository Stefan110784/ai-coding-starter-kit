# KF3-23: Auftragspriorität + sortierte Tagesliste

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 2 („Fertigungsaufträge mit Priorität und Solltermin, Tagesliste als sortierte Queue")

## Ziel

Bei 3 Mitarbeitern braucht es kein APS — aber eine eindeutig sortierte Arbeitsreihenfolge. Aufträge erhalten eine Priorität; der Arbeitsvorrat (Tagesliste) wird zur sortierten Queue.

## Umsetzung

- **Schema:** `Auftrag.prioritaet Int @default(0)` — 0 = Normal, 1 = Hoch, 2 = Dringend (additiv, Migration `20260611132055_auftrag_prioritaet`).
- **Sortierung:** `TAGESLISTE_ORDER` in `src/lib/arbeitsvorrat.ts` — Priorität absteigend, dann `promisedDate` aufsteigend (NULLs zuletzt), dann Nummer. Genutzt in `/api/arbeitsvorrat`, `/api/arbeitsvorrat/alle`, `/api/arbeitsvorrat/uebersicht`.
- **API:** `prioritaet` in Create-/Update-Schema (`/api/auftraege`, `/api/auftraege/[id]`), Zod `int 0–2`.
- **UI:** `src/components/prioritaet-badge.tsx` (Badge nur bei Priorität > 0); Anzeige in Auftragsliste, Detail-Sheet und Arbeitsvorrat-Bucket; Auswahl im Anlege- und Bearbeiten-Dialog.

## Akzeptanzkriterien

- [x] Auftrag kann mit Priorität angelegt und nachträglich umpriorisiert werden
- [x] Arbeitsvorrat sortiert: Dringend vor Hoch vor Normal, innerhalb gleicher Priorität frühester zugesagter Termin zuerst, ohne Termin zuletzt
- [x] Bestehende Aufträge unverändert (Default 0, keine Badge)

## Bewusst nicht

- Kein Solltermin-Zusatzfeld (zugesagter Termin `promisedDate` übernimmt die Terminkomponente der Queue)
- Kein APS / keine Kapazitätsoptimierung
