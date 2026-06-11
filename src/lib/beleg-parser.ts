/**
 * PDF-Auswertung für Auftragsbestätigungen — 1:1-Port von V2
 * services/beleg_parser.py (ursprünglich KIMA-Flow 1.6.2).
 *
 * Extrahiert aus einer AB-PDF: AB-Nummer, Projekt-/Auftragsnummer, Kunde,
 * Liefertermin und Positionen; leitet daraus die Produktgruppe ab.
 * Die reine Textauswertung (`parseText`) ist von der PDF-Öffnung getrennt,
 * damit sie ohne pdfjs/echte PDF testbar ist.
 */

// ── Positions-Erkennung ─────────────────────────────────────────────────────
const UNIT = String.raw`([A-Za-zäöüÄÖÜ]+\([sne]\)|St[üu]ck|Stk\.?|pcs)`;
const POS_RX = new RegExp(
  String.raw`^\s*(\d{1,3}(?:\.\d{1,3})?)\s+(?:([A-Z]{0,4}\d[0-9A-Z]{3,})\s+)?(.+?)\s+(\d+)\s*` + UNIT
);
const AB_RX = /AB\d{4}-\d{3,6}/;

/** AB-Nummer aus einem Dateinamen (V2: extrahiere_ab_nummer). */
const AB_DATEI_RX = /(AB\d{4}-\d+)/i;
export function extrahiereAbNummer(dateiname: string | null | undefined): string | null {
  const m = AB_DATEI_RX.exec(dateiname ?? "");
  return m ? m[1].toUpperCase() : null;
}

export const AB_VOLL_RX = /^AB\d{4}-\d+$/i;

// ── Produktgruppen-Ableitung ────────────────────────────────────────────────
// Suchbegriff (Großschreibung) → Anzeigename.
export const PRODUKTGRUPPEN: Array<[string, string]> = [
  ["KILNCOOLER", "KilnCooler"],
  ["KILNPILOT", "KilnPilot"],
  ["SMARTFILL", "SmartFill"],
  ["SMARTCONTROL", "SmartControl"],
  ["MILLPILOT", "MillPilot"],
  ["GASTEMP", "GasTemp"],
  ["V-SENS", "V-Sens"],
  ["VSENS", "V-Sens"],
];
export const PRODUKT_ALIASE: Array<[string, string]> = [
  ["OMU", "SmartFill"],
  ["FILL LEVEL", "SmartFill"],
];
const BASIS_KEYWORDS = ["BASE SYSTEM", "BASISSYSTEM", "GRUNDSYSTEM", "BASE UNIT", "MOBILE"];
const BASIS_AUSSCHLUSS = [
  "SPARE", "TAUSCHTEIL", "ERSATZ", "UPGRADE", "PLATINE",
  "KIT", "KABEL", "CABLE", "BEDIENELEMENT", "IPC",
];
const SPARE_LABEL = "Spare Parts";

export interface BelegPosition {
  pos: string;
  artikelnummer: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  langtext: string;
}

export interface GeparsterBeleg {
  abNummer: string;
  nummer: string | null;
  kunde: string | null;
  liefertermin: string | null;
  positionen: BelegPosition[];
}

function produktEinerPosition(p: Pick<BelegPosition, "bezeichnung" | "langtext">): string | null {
  const text = `${p.bezeichnung ?? ""} ${p.langtext ?? ""}`.toUpperCase();
  for (const [key, name] of PRODUKTGRUPPEN) if (text.includes(key)) return name;
  for (const [key, name] of PRODUKT_ALIASE) if (text.includes(key)) return name;
  return null;
}

/** Ob eine Position ein Basissystem ist; `flags` (artikelnummer→true) hat Vorrang. */
export function positionIstBasissystem(
  p: BelegPosition,
  flags?: Record<string, boolean | undefined>
): boolean {
  const anr = (p.artikelnummer ?? "").trim();
  if (flags && anr in flags && flags[anr] !== undefined) return Boolean(flags[anr]);
  const bez = (p.bezeichnung ?? "").toUpperCase();
  if (!BASIS_KEYWORDS.some((k) => bez.includes(k))) return false;
  if (BASIS_AUSSCHLUSS.some((k) => bez.includes(k))) return false;
  return produktEinerPosition(p) !== null;
}

/**
 * Produktbezeichnung eines Auftrags aus den Positionen:
 * mind. ein Basissystem → dessen Produktgruppe(n); sonst produktbezogene
 * Position → "Spare Parts"; sonst "" (leer).
 */
export function produktgruppeAusPositionen(
  positionen: BelegPosition[],
  flags?: Record<string, boolean | undefined>
): string {
  const basis = (positionen ?? []).filter((p) => positionIstBasissystem(p, flags));
  if (basis.length > 0) {
    const gefunden: string[] = [];
    for (const p of basis) {
      const name = produktEinerPosition(p);
      if (name && !gefunden.includes(name)) gefunden.push(name);
    }
    if (gefunden.length > 0) return gefunden.join(", ");
  }
  for (const p of positionen ?? []) {
    if (produktEinerPosition(p)) return SPARE_LABEL;
  }
  return "";
}

// ── Textauswertung ──────────────────────────────────────────────────────────
export function parseText(seiten: string[], stem = ""): GeparsterBeleg {
  const full = seiten.join("\n");
  const erste = seiten.length > 0 ? seiten[0].split("\n") : [];

  const abMatch = AB_RX.exec(full);
  const abNummer = abMatch ? abMatch[0] : stem;

  let nummer: string | null = null;
  const pm = /(?:Project no\.?|Projektnr\.?)\s*([A-Z]?P\d{4,6})/.exec(full);
  if (pm) {
    nummer = pm[1];
  } else {
    const fallback = /\bP\d{4,6}\b/.exec(full);
    if (fallback) nummer = fallback[0];
  }

  let kunde: string | null = null;
  let start = 0;
  for (let i = 0; i < erste.length; i++) {
    const l = erste[i];
    if (l.includes("Guestener") && (l.includes("Confirmation") || l.includes("Auftragsbest"))) {
      start = i + 1;
      break;
    }
  }
  for (const l of erste.slice(start)) {
    if (l.slice(0, 46).trim()) {
      kunde = l.trim().split(/\s{3,}/)[0].trim();
      break;
    }
  }

  let liefertermin: string | null = null;
  const fl = full.split("\n");
  for (let i = 0; i < fl.length; i++) {
    if (/Versandtermin|Date of shipment/.test(fl[i])) {
      for (const nxt of fl.slice(i + 1, i + 4)) {
        if (nxt.trim()) {
          liefertermin = nxt.trim();
          break;
        }
      }
      break;
    }
  }

  const positionen: BelegPosition[] = [];
  let inTabelle = false;
  for (const l of fl) {
    if (/Produktnr|Product no/.test(l)) {
      inTabelle = true;
      continue;
    }
    if (/Zwischensumme|Sub-total|Seite \d+ von|Page \d+ of|Gesch[äa]ftsf|Management/.test(l)) {
      inTabelle = false;
    }
    if (!inTabelle) continue;

    const mm = POS_RX.exec(l);
    if (mm) {
      positionen.push({
        pos: mm[1],
        artikelnummer: mm[2] ?? "",
        bezeichnung: mm[3].trim(),
        menge: parseInt(mm[4], 10),
        einheit: mm[5],
        langtext: "",
      });
    } else if (positionen.length > 0) {
      const text = l.trim();
      if (text) {
        const letzte = positionen[positionen.length - 1];
        letzte.langtext = letzte.langtext ? `${letzte.langtext}\n${text}` : text;
      }
    }
  }

  return { abNummer, nummer, kunde, liefertermin, positionen };
}

/** Öffnet eine PDF und wertet sie aus (V2: parse_beleg). */
export async function parseBeleg(daten: Uint8Array, dateiname: string): Promise<GeparsterBeleg> {
  const { extrahiereSeitenTexte } = await import("@/lib/pdf-text");
  const seiten = await extrahiereSeitenTexte(daten);
  const stem = dateiname.replace(/\.[^.]+$/, "");
  return parseText(seiten, stem);
}
