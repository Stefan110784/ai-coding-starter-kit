/**
 * Zentraler Rechte-Katalog (Seiten + Funktionen) und Auswertung je Nutzer.
 * Port von KIMA-Flow V2 `backend/app/rechte.py`.
 *
 * Einzige Wahrheitsquelle der Rechte-Schlüssel:
 * - Das Frontend lädt den Katalog über GET /api/benutzer/rechte-katalog und
 *   blendet Tabs/Buttons per `hatRecht(key)` ein/aus.
 * - Das Backend setzt dieselben Schlüssel über `requireRecht(req, key)` durch.
 *
 * Modell:
 * - Admin hat IMMER Vollzugriff (alle Rechte), unabhängig vom gespeicherten Feld.
 * - Ist für einen Nutzer ein Rechte-Feld gesetzt (Liste), gilt genau diese Menge
 *   (auch die leere Liste = bewusster Komplett-Entzug).
 * - Ist nichts gesetzt (null), greift der Rollen-Standard (STANDARD_RECHTE).
 */
import type { Benutzer } from "@/generated/prisma";

export interface RechteFunktion {
  key: string;
  label: string;
}

export interface RechteGruppe {
  key: string;
  label: string;
  funktionen: RechteFunktion[];
}

/**
 * Geordneter Katalog: je Seite eine Gruppe mit optionalen Funktions-Rechten.
 * Der Gruppen-`key` entspricht der Seite (Nav-Schlüssel im Frontend).
 * V3 ergänzt gegenüber V2 die neuen Seiten planung & lieferanten.
 */
export const RECHTE_KATALOG: RechteGruppe[] = [
  { key: "dashboard", label: "Dashboard", funktionen: [] },
  {
    key: "auftraege",
    label: "Aufträge",
    funktionen: [{ key: "auftraege.status", label: "Status ändern / reaktivieren" }],
  },
  {
    key: "zeiten",
    label: "Zeiterfassung",
    funktionen: [{ key: "zeiten.fremde", label: "Für andere Mitarbeiter buchen / korrigieren" }],
  },
  {
    key: "qualitaet",
    label: "Qualität",
    funktionen: [{ key: "qualitaet.loeschen", label: "Buchungen löschen" }],
  },
  {
    key: "lager",
    label: "Material / Lager",
    funktionen: [{ key: "lager.buchen", label: "Wareneingang / Umlagerung buchen" }],
  },
  { key: "planung", label: "Planung / Timeline", funktionen: [] },
  { key: "lieferanten", label: "Lieferanten & EOQ", funktionen: [] },
  {
    key: "einkauf",
    label: "Einkauf / Bestellungen",
    funktionen: [{ key: "einkauf.bestellen", label: "Bestellungen anlegen / ändern" }],
  },
  { key: "auswertung", label: "Auswertung", funktionen: [] },
  { key: "verwaltung", label: "Verwaltung (Stammdaten & Benutzer)", funktionen: [] },
];

function alleKeys(): Set<string> {
  const keys = new Set<string>();
  for (const gruppe of RECHTE_KATALOG) {
    keys.add(gruppe.key);
    for (const fn of gruppe.funktionen) keys.add(fn.key);
  }
  return keys;
}

/** Alle gültigen Rechte-Schlüssel (für Validierung beim Speichern). */
export const ALLE_RECHTE: ReadonlySet<string> = alleKeys();

/**
 * Rollen-Standard = heutiges V2-Verhalten. Greift nur, solange ein Nutzer noch
 * nie individuell konfiguriert wurde (rechte IS NULL).
 */
export const STANDARD_RECHTE: Record<string, ReadonlySet<string>> = {
  admin: ALLE_RECHTE,
  kommissionierung: new Set([
    "dashboard",
    "auftraege",
    "zeiten",
    "qualitaet",
    "lager",
    "lager.buchen",
    // Einkauf sehen + Wareneingang buchen (WE verlangt serverseitig zusätzlich
    // lager.buchen); Bestellungen anlegen (einkauf.bestellen) bleibt Admin.
    "einkauf",
  ]),
  mitarbeiter: new Set(["dashboard", "auftraege", "zeiten", "qualitaet"]),
};

/** Die tatsächlich geltenden Rechte-Schlüssel eines Nutzers. */
export function effektiveRechte(user: Pick<Benutzer, "rolle" | "rechte">): Set<string> {
  if (user.rolle === "admin") return new Set(ALLE_RECHTE);
  if (user.rechte != null && Array.isArray(user.rechte)) {
    // Nur bekannte Schlüssel zulassen (Unbekanntes aus älteren Versionen ignorieren).
    return new Set((user.rechte as string[]).filter((k) => ALLE_RECHTE.has(k)));
  }
  return new Set(STANDARD_RECHTE[user.rolle] ?? new Set());
}

export function hatRecht(user: Pick<Benutzer, "rolle" | "rechte">, key: string): boolean {
  return effektiveRechte(user).has(key);
}
