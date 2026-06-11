/**
 * Beleg-Import: AB-PDFs auswerten und daraus Aufträge anlegen/aktualisieren —
 * Port von V2 services/beleg_import.py.
 *
 * Pro Auftragsbestätigung (AB-PDF):
 * - Inhalt auswerten (beleg-parser): AB-Nr, Projekt-Nr, Kunde, Liefertermin,
 *   Positionen, abgeleitete Produktgruppe.
 * - Auftrag mit dieser AB-Nummer vorhanden → Felder auffrischen und den einen
 *   Beleg-Anhang ersetzen (Status/Zeiten/manuelle Anhänge bleiben unberührt).
 * - Sonst → neuen Auftrag (quelle='pdf') mit Positionen anlegen, Artikel
 *   pflegen und die PDF anhängen.
 *
 * Inkrementell über `importierter_beleg` (absoluter Pfad + mtime + Größe).
 * Enthält BELEGE_DIR den Platzhalter {jahr}, werden aktuelles und Vorjahr gescannt.
 */
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { auditEintrag, auditFeldDiff } from "@/lib/audit";
import { BELEGE_DIR } from "@/lib/config";
import * as storage from "@/lib/storage";
import { parseLiefertermin } from "@/lib/liefertermin";
import { nettobedarfFuerAuftrag } from "@/lib/stueckliste";
import { reservierungAktualisieren } from "@/lib/reservierung";
import {
  parseBeleg,
  produktgruppeAusPositionen,
  extrahiereAbNummer,
  AB_VOLL_RX,
  type BelegPosition,
  type GeparsterBeleg,
} from "@/lib/beleg-parser";
import type { Prisma } from "@/generated/prisma";

/** Quelle-Kennzeichen des automatisch importierten Beleg-Anhangs (wie 1.x/V2). */
export const BELEG_QUELLE = "pdf-beleg";
/** Quelle eines aus einem Beleg angelegten Auftrags. */
export const AUFTRAG_QUELLE = "pdf";

export interface ImportErgebnis {
  quelle: string;
  geprueft: number;
  angelegt: number;
  aktualisiert: number;
  uebersprungen: number;
  fehler: Array<{ datei: string; fehler: string }>;
  fehlerText?: string;
}

/** Zu scannende Verzeichnisse: {jahr}-Platzhalter → aktuelles + Vorjahr. */
export function quellenVerzeichnisse(belegeDir: string): string[] {
  if (belegeDir.includes("{jahr}")) {
    const jahr = new Date().getFullYear();
    return [String(jahr), String(jahr - 1)].map((j) => belegeDir.replaceAll("{jahr}", j));
  }
  return [belegeDir];
}

/** Findet einen Artikel oder legt ihn (als ungeprüft) neu an (V2: artikel_sicherstellen). */
async function artikelSicherstellen(
  tx: Prisma.TransactionClient,
  artikelnummer: string | null,
  bezeichnung: string | null
) {
  const anr = (artikelnummer ?? "").trim();
  if (!anr) return null;
  const vorhanden = await tx.artikel.findUnique({ where: { artikelnummer: anr } });
  if (vorhanden) return vorhanden;
  return tx.artikel.create({
    data: { artikelnummer: anr, bezeichnung: bezeichnung || anr, ungeprueft: true },
  });
}

/** Ersetzt die Positionen eines Auftrags durch die geparsten und pflegt Artikel. */
async function setzePositionen(
  tx: Prisma.TransactionClient,
  auftragId: string,
  positionen: BelegPosition[]
) {
  await tx.auftragPosition.deleteMany({ where: { auftragId } });
  for (let i = 0; i < positionen.length; i++) {
    const p = positionen[i];
    const anr = (p.artikelnummer ?? "").trim() || null;
    const artikel = anr ? await artikelSicherstellen(tx, anr, p.bezeichnung) : null;
    await tx.auftragPosition.create({
      data: {
        auftragId,
        posNr: i + 1,
        artikelnummer: anr,
        bezeichnung: artikel?.bezeichnung || p.bezeichnung,
        menge: p.menge,
        einheit: p.einheit || "Stk",
      },
    });
  }
}

/** Löscht vorhandene automatisch importierte Beleg-Anhänge (DB + Ablage). */
async function entferneBelegAnhaenge(tx: Prisma.TransactionClient, auftragId: string) {
  const alte = await tx.datei.findMany({ where: { auftragId, quelle: BELEG_QUELLE } });
  for (const d of alte) {
    await storage.loesche(d.speicherpfad);
    await tx.datei.delete({ where: { id: d.id } });
  }
}

/** Hängt die PDF als Beleg-Anhang an den Auftrag (Datei-Row + Ablage). */
async function haengeBelegAn(
  tx: Prisma.TransactionClient,
  auftragId: string,
  name: string,
  bytes: Buffer
) {
  const dateiId = randomUUID();
  const rel = storage.relPfad(auftragId, dateiId, name);
  const size = await storage.schreibe(rel, bytes);
  await tx.datei.create({
    data: {
      id: dateiId,
      auftragId,
      name,
      size,
      mimetype: "application/pdf",
      quelle: BELEG_QUELLE,
      speicherpfad: rel,
    },
  });
}

/**
 * Verarbeitet einen bereits geparsten Beleg: Auftrag anlegen oder auffrischen,
 * Positionen ersetzen, Beleg-Anhang erneuern. Wirft bei ungültiger AB-Nummer.
 */
export async function verarbeiteBeleg(
  daten: GeparsterBeleg,
  pdfName: string,
  pdfBytes: Buffer,
  flags: Record<string, boolean>
): Promise<"angelegt" | "aktualisiert"> {
  const ab = (daten.abNummer ?? "").toUpperCase();
  if (!ab || !AB_VOLL_RX.test(ab)) throw new Error("keine AB-Nummer im Beleg erkannt");

  const positionen = daten.positionen ?? [];
  const menge = positionen.reduce((s, p) => s + (p.menge || 0), 0) || 1;
  const produktgruppe = produktgruppeAusPositionen(positionen, flags);
  const promisedDate = parseLiefertermin(daten.liefertermin);

  // Serializable wie POST /api/auftraege (KF3-33): der Import ist der zweite
  // Reservierungs-Anlagepfad — parallele Läufe dürfen nicht beide den vollen
  // Bestand sehen. Bei Serialisierungskonflikt (P2034) einmal wiederholen.
  const lauf = () => prisma.$transaction(async (tx) => {
    const vorhanden = await tx.auftrag.findFirst({ where: { abNummer: ab } });
    if (vorhanden) {
      // Ist der Auftrag mit einem Kundenauftrag verknüpft (KF3-37), ist die
      // Relation für den Kundennamen führend — der Parser-Wert wird nicht
      // mehr übernommen; eine Abweichung landet als Konflikt im Audit.
      const kundeFuehrend = vorhanden.kundenauftragId !== null;
      if (kundeFuehrend && daten.kunde && daten.kunde !== vorhanden.kunde) {
        await auditEintrag(tx, {
          entitaet: "auftrag",
          entitaetId: vorhanden.id,
          aktion: "kundeKonflikt",
          altWert: vorhanden.kunde,
          neuWert: daten.kunde,
          kontext: { abNummer: ab, hinweis: "Beleg nennt anderen Kunden als der Kundenauftrag" },
          benutzerId: null,
        });
      }
      const update = {
        ...(kundeFuehrend ? {} : { kunde: daten.kunde }),
        liefertermin: daten.liefertermin,
        menge,
        ...(produktgruppe && !vorhanden.produktManuell ? { bezeichnung: produktgruppe } : {}),
        ...(!vorhanden.promisedDateManuell ? { promisedDate } : {}),
      };
      // Audit (ISO 7.5): auch der Import-Pfad protokolliert Feldänderungen —
      // benutzerId NULL = Systemlauf (Review-Befund: Import lief am Log vorbei)
      await auditFeldDiff(tx, "auftrag", vorhanden.id, null, vorhanden, update, [
        "kunde",
        "liefertermin",
        "menge",
        "bezeichnung",
        "promisedDate",
      ]);
      await tx.auftrag.update({ where: { id: vorhanden.id }, data: update });
      await setzePositionen(tx, vorhanden.id, positionen);
      // Reservierung neu rechnen — NUR wenn noch KEINE Entnahmen existieren
      // (der Status ist dafür kein verlässlicher Proxy: manuelle Entnahme lässt
      // ihn auf offen, Reaktivierung setzt ihn zurück — Review-Befund Paket 3)
      // und der Auftrag nicht schon kommissioniert/abgeschlossen ist.
      const hatEntnahme = await tx.materialbewegung.findFirst({
        where: { auftragId: vorhanden.id, art: "entnahme" },
        select: { id: true },
      });
      if (!hatEntnahme && ["offen", "laeuft", "pausiert"].includes(vorhanden.status)) {
        const bedarf = await nettobedarfFuerAuftrag(tx, vorhanden.id);
        await reservierungAktualisieren(tx, vorhanden.id, bedarf, null);
      }
      await entferneBelegAnhaenge(tx, vorhanden.id);
      await haengeBelegAn(tx, vorhanden.id, pdfName, pdfBytes);
      return "aktualisiert";
    }

    const auftrag = await tx.auftrag.create({
      data: {
        nummer: daten.nummer || ab,
        bezeichnung: produktgruppe || "Diverses",
        menge,
        kunde: daten.kunde,
        liefertermin: daten.liefertermin,
        promisedDate,
        abNummer: ab,
        quelle: AUFTRAG_QUELLE,
        status: "offen",
      },
    });
    await auditEintrag(tx, {
      entitaet: "auftrag",
      entitaetId: auftrag.id,
      aktion: "erstellt",
      kontext: { nummer: auftrag.nummer, quelle: AUFTRAG_QUELLE },
      benutzerId: null,
    });
    await setzePositionen(tx, auftrag.id, positionen);
    // Material reservieren (KF3-33) — Systemlauf, benutzerId null
    const bedarf = await nettobedarfFuerAuftrag(tx, auftrag.id);
    await reservierungAktualisieren(tx, auftrag.id, bedarf, null);
    await haengeBelegAn(tx, auftrag.id, pdfName, pdfBytes);
    return "angelegt";
  }, { isolationLevel: "Serializable" });

  try {
    return await lauf();
  } catch (e) {
    if ((e as { code?: string })?.code === "P2034") return lauf();
    throw e;
  }
}

/** Basissystem-Flags: artikelnummer → true für alle markierten Artikel. */
export async function basissystemFlags(): Promise<Record<string, boolean>> {
  const artikel = await prisma.artikel.findMany({
    where: { istBasissystem: true },
    select: { artikelnummer: true },
  });
  return Object.fromEntries(artikel.map((a) => [a.artikelnummer, true]));
}

async function merkeVerarbeitet(
  schluessel: string,
  stat: { mtimeMs: number; size: number },
  ab: string | null,
  jetzt: Date
) {
  const daten = {
    mtime: new Date(stat.mtimeMs),
    size: stat.size,
    abNummer: ab,
    verarbeitetAm: jetzt,
  };
  await prisma.importierterBeleg.upsert({
    where: { dateiname: schluessel },
    create: { dateiname: schluessel, ...daten },
    update: daten,
  });
}

/** Verzeichnis-Scan + Import-Lauf (V2: importiere). */
export async function importiereBelege(belegeDir?: string): Promise<ImportErgebnis> {
  const quellen = quellenVerzeichnisse(belegeDir ?? BELEGE_DIR);
  const ergebnis: ImportErgebnis = {
    quelle: quellen.join(", "),
    geprueft: 0,
    angelegt: 0,
    aktualisiert: 0,
    uebersprungen: 0,
    fehler: [],
  };

  const vorhandene: string[] = [];
  for (const q of quellen) {
    try {
      if ((await fs.stat(q)).isDirectory()) vorhandene.push(q);
    } catch {
      // Verzeichnis existiert nicht
    }
  }
  if (vorhandene.length === 0) {
    ergebnis.fehlerText = "Belege-Quelle nicht gefunden";
    return ergebnis;
  }

  const jetzt = new Date();
  const flags = await basissystemFlags();

  for (const quelle of vorhandene) {
    const eintraege = await fs.readdir(quelle, { recursive: true, withFileTypes: true });
    const pdfs = eintraege
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
      .map((e) => path.join(e.parentPath, e.name))
      .sort();

    for (const pdfPfad of pdfs) {
      const name = path.basename(pdfPfad);
      if (!extrahiereAbNummer(name)) continue; // nur AB-Belege
      ergebnis.geprueft += 1;

      let stat;
      try {
        stat = await fs.stat(pdfPfad);
      } catch {
        continue; // transient: Datei verschwand
      }
      const vorhanden = await prisma.importierterBeleg.findUnique({ where: { dateiname: pdfPfad } });
      if (
        vorhanden &&
        vorhanden.mtime.getTime() === new Date(stat.mtimeMs).getTime() &&
        vorhanden.size === stat.size
      ) {
        ergebnis.uebersprungen += 1;
        continue;
      }

      let daten: GeparsterBeleg;
      let bytes: Buffer;
      try {
        bytes = await fs.readFile(pdfPfad);
        daten = await parseBeleg(new Uint8Array(bytes), name);
        const status = await verarbeiteBeleg(daten, name, bytes, flags);
        ergebnis[status] += 1;
        await merkeVerarbeitet(pdfPfad, stat, daten.abNummer.toUpperCase(), jetzt);
      } catch (e) {
        ergebnis.fehler.push({ datei: name, fehler: e instanceof Error ? e.message : String(e) });
        // Persistenten Parse-Fehler merken, damit nicht bei jedem Lauf neu geparst wird.
        await merkeVerarbeitet(pdfPfad, stat, null, jetzt);
      }
    }
  }

  return ergebnis;
}
