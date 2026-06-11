/**
 * Datenbeschaffung für die Pareto-Auswertung (KF3-34) — gemeinsam für die
 * JSON- und die CSV-Route. Zeitraumvergleich über lokalDatum (Europe/Berlin,
 * gleiche Fehlerklasse wie in kpiFuerZeitraum gefixt): SQL filtert grob mit
 * 1 Tag Polster, die Tagesgrenze entscheidet in JS.
 */
import type { Db } from "@/lib/bestand";
import { lokalDatum } from "@/lib/auswertung";

export type ParetoTyp = "nacharbeitsgruende" | "fehlteile";
export type FehlteilQuelle = "bestellbezug" | "mangel";
export type AbwTypFilter = "nacharbeit" | "ausschuss" | "reklamationKunde" | "reklamationLieferant" | "fuenfs" | "alle";

export interface ParetoRohdaten {
  zaehlung: Array<{ key: string; label: string; anzahl: number }>;
  /** Nur bei Nacharbeitsgründen: Fälle ohne gepflegten Grund. */
  ohneGrund: number;
}

function grobVon(von: string): Date {
  const d = new Date(`${von}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function grobBis(bis: string): Date {
  const d = new Date(`${bis}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 2);
  return d;
}

function imZeitraum(d: Date, von: string, bis: string): boolean {
  const tag = lokalDatum(d);
  return tag >= von && tag <= bis;
}

function artikelLabel(artikelnummer: string, bezeichnung?: string | null): string {
  return bezeichnung && bezeichnung !== artikelnummer
    ? `${artikelnummer} — ${bezeichnung}`
    : artikelnummer;
}

export async function ladeParetoGruende(
  db: Db,
  von: string,
  bis: string,
  abwTyp: AbwTypFilter
): Promise<ParetoRohdaten> {
  const abweichungen = await db.abweichung.findMany({
    where: {
      ...(abwTyp === "alle" ? {} : { typ: abwTyp }),
      erfasstAm: { gte: grobVon(von), lt: grobBis(bis) },
    },
    select: { grundId: true, erfasstAm: true, grund: { select: { name: true } } },
  });

  const anzahlJeGrund = new Map<string, { label: string; anzahl: number }>();
  let ohneGrund = 0;
  for (const a of abweichungen) {
    if (!imZeitraum(a.erfasstAm, von, bis)) continue;
    if (!a.grundId) {
      ohneGrund++;
      continue;
    }
    const eintrag = anzahlJeGrund.get(a.grundId) ?? { label: a.grund?.name ?? "(gelöscht)", anzahl: 0 };
    eintrag.anzahl++;
    anzahlJeGrund.set(a.grundId, eintrag);
  }

  const zaehlung = [...anzahlJeGrund.entries()].map(([key, e]) => ({ key, ...e }));
  if (ohneGrund > 0) {
    zaehlung.push({ key: "ohne", label: "(ohne Grund)", anzahl: ohneGrund });
  }
  return { zaehlung, ohneGrund };
}

export async function ladeParetoFehlteile(
  db: Db,
  von: string,
  bis: string,
  quelle: FehlteilQuelle
): Promise<ParetoRohdaten> {
  const anzahlJeArtikel = new Map<string, { label: string; anzahl: number }>();
  const zaehle = (artikelnummer: string, bezeichnung?: string | null) => {
    const eintrag =
      anzahlJeArtikel.get(artikelnummer) ?? { label: artikelLabel(artikelnummer, bezeichnung), anzahl: 0 };
    eintrag.anzahl++;
    anzahlJeArtikel.set(artikelnummer, eintrag);
  };

  if (quelle === "bestellbezug") {
    // Fehlteil-Bezug aus KF3-29: Bestellposition entstand aus einem Fertigungsauftrag
    const positionen = await db.bestellPosition.findMany({
      where: {
        auftragId: { not: null },
        bestellung: { status: { not: "storniert" }, erstelltAm: { gte: grobVon(von), lt: grobBis(bis) } },
      },
      select: {
        artikelnummer: true,
        artikel: { select: { bezeichnung: true } },
        bestellung: { select: { erstelltAm: true } },
      },
    });
    for (const p of positionen) {
      if (!imZeitraum(p.bestellung.erstelltAm, von, bis)) continue;
      zaehle(p.artikelnummer, p.artikel.bezeichnung);
    }
  } else {
    // Kommissionier-Mangel: Snapshot mit Nettobedarf auf Fehlteil-Aufträgen
    // (stalledMissingParts-Filter, sonst zählt jedes nicht lagergeführte
    // Kaufteil als „Fehlteil“)
    const snapshots = await db.auftragMaterialSnapshot.findMany({
      where: {
        nettobedarf: { gt: 0 },
        erstelltAm: { gte: grobVon(von), lt: grobBis(bis) },
        auftrag: { stalledMissingParts: true },
      },
      select: { artikelnummer: true, bezeichnung: true, erstelltAm: true },
    });
    for (const s of snapshots) {
      if (!imZeitraum(s.erstelltAm, von, bis)) continue;
      zaehle(s.artikelnummer, s.bezeichnung);
    }
  }

  return { zaehlung: [...anzahlJeArtikel.entries()].map(([key, e]) => ({ key, ...e })), ohneGrund: 0 };
}
