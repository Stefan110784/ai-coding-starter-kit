import { describe, it, expect } from "vitest";
import {
  nettobedarfAusDaten,
  bedarfsbaumAusDaten,
  sollSekundenNettoAusDaten,
  type BomDaten,
  type AuftragPos,
} from "./stueckliste";

function daten(opts: {
  kinder?: Record<string, Array<{ artikelnummer: string; menge: number }>>;
  bestand?: Record<string, number>;
  vorgabezeit?: Record<string, number>;
}): BomDaten {
  return {
    kinder: new Map(
      Object.entries(opts.kinder ?? {}).map(([parent, ks]) => [
        parent,
        ks.map((k) => ({ ...k, einheit: "Stk", bezeichnung: k.artikelnummer })),
      ])
    ),
    bestand: new Map(Object.entries(opts.bestand ?? {})),
    vorgabezeit: new Map(Object.entries(opts.vorgabezeit ?? {})),
  };
}

function pos(artikelnummer: string, menge: number): AuftragPos {
  return { artikelnummer, menge, einheit: "Stk", bezeichnung: artikelnummer };
}

describe("nettobedarfAusDaten", () => {
  it("Blatt-Artikel: Nettobedarf = Bedarf − Bestand, ausLager = min", () => {
    const d = daten({ bestand: { ET1: 3 } });
    const r = nettobedarfAusDaten(d, [pos("ET1", 5)]);
    expect(r.positionen).toEqual([
      expect.objectContaining({
        artikelnummer: "ET1",
        bruttobedarf: 5,
        bestand: 3,
        nettobedarf: 2,
        ausLager: 3,
        typ: "einzelteil",
      }),
    ]);
    expect(r.mangel).toBe(true);
    expect(r.mangelnd).toHaveLength(1);
  });

  it("Baugruppe mit Lagerbestand deckt zuerst, Rest geht auf Kinder", () => {
    // BG (Bestand 3) → 2× ET1; Auftrag braucht 5 BG → 3 aus Lager, 2 fertigen → 4 ET1
    const d = daten({
      kinder: { BG: [{ artikelnummer: "ET1", menge: 2 }] },
      bestand: { BG: 3, ET1: 10 },
    });
    const r = nettobedarfAusDaten(d, [pos("BG", 5)]);
    const bg = r.positionen.find((p) => p.artikelnummer === "BG");
    const et = r.positionen.find((p) => p.artikelnummer === "ET1");
    expect(bg).toMatchObject({ typ: "baugruppe", ausLager: 3, nettobedarf: 0, bruttobedarf: 5 });
    expect(et).toMatchObject({ typ: "einzelteil", bruttobedarf: 4, nettobedarf: 0, ausLager: 4 });
    expect(r.mangel).toBe(false);
  });

  it("Baugruppe komplett aus Lager gedeckt: Kinder werden nicht aufgelöst (Pruning)", () => {
    const d = daten({
      kinder: { BG: [{ artikelnummer: "ET1", menge: 2 }] },
      bestand: { BG: 5 },
    });
    const r = nettobedarfAusDaten(d, [pos("BG", 5)]);
    expect(r.positionen.map((p) => p.artikelnummer)).toEqual(["BG"]);
  });

  it("Baugruppe ohne Bestand erscheint nicht in positionen (V2-Quirk)", () => {
    const d = daten({
      kinder: { BG: [{ artikelnummer: "ET1", menge: 1 }] },
      bestand: {},
    });
    const r = nettobedarfAusDaten(d, [pos("BG", 2)]);
    expect(r.positionen.map((p) => p.artikelnummer)).toEqual(["ET1"]);
    expect(r.positionen[0]).toMatchObject({ bruttobedarf: 2, nettobedarf: 2, ausLager: 0 });
  });

  it("mehrstufig: Mengen multiplizieren über Ebenen", () => {
    // A → 2×B, B → 3×C, Bedarf 2A, kein Bestand → 12 C
    const d = daten({
      kinder: {
        A: [{ artikelnummer: "B", menge: 2 }],
        B: [{ artikelnummer: "C", menge: 3 }],
      },
    });
    const r = nettobedarfAusDaten(d, [pos("A", 2)]);
    const c = r.positionen.find((p) => p.artikelnummer === "C");
    expect(c).toMatchObject({ bruttobedarf: 12, nettobedarf: 12 });
  });

  it("gleiche Artikel aus mehreren Positionen werden summiert; Bestand wird nicht dekrementiert (V2-Quirk)", () => {
    const d = daten({ bestand: { ET1: 4 } });
    const r = nettobedarfAusDaten(d, [pos("ET1", 3), pos("ET1", 3)]);
    expect(r.positionen).toHaveLength(1);
    // Beide Positionen sehen den vollen Bestand 4: ausLager = 3+3, netto = 0+0
    expect(r.positionen[0]).toMatchObject({ bruttobedarf: 6, ausLager: 6, nettobedarf: 0 });
  });

  it("Zyklus A→B→A terminiert", () => {
    const d = daten({
      kinder: {
        A: [{ artikelnummer: "B", menge: 1 }],
        B: [{ artikelnummer: "A", menge: 1 }],
      },
    });
    // Terminiert dank Pfad-Schutz; beide sind Baugruppen mit ausLager=0 → leere Liste
    const r = nettobedarfAusDaten(d, [pos("A", 1)]);
    expect(r.positionen).toEqual([]);
    expect(r.mangel).toBe(false);
  });
});

describe("bedarfsbaumAusDaten", () => {
  it("liefert alle Knoten mit Ebenen, auch Baugruppen ohne Bestand", () => {
    const d = daten({
      kinder: {
        A: [{ artikelnummer: "B", menge: 2 }],
        B: [{ artikelnummer: "C", menge: 1 }],
      },
    });
    const baum = bedarfsbaumAusDaten(d, [pos("A", 1)]);
    expect(baum.map((z) => [z.artikelnummer, z.ebene])).toEqual([
      ["A", 0],
      ["B", 1],
      ["C", 2],
    ]);
  });

  it("Pruning bei voll gedeckter Baugruppe", () => {
    const d = daten({
      kinder: { A: [{ artikelnummer: "B", menge: 2 }] },
      bestand: { A: 5 },
    });
    const baum = bedarfsbaumAusDaten(d, [pos("A", 1)]);
    expect(baum.map((z) => z.artikelnummer)).toEqual(["A"]);
    expect(baum[0].nettobedarf).toBe(0);
  });
});

describe("sollSekundenNettoAusDaten", () => {
  it("flacher Artikel ohne Stückliste: menge × vorgabezeit × 60, Lager ignoriert", () => {
    const d = daten({ vorgabezeit: { ET1: 5 }, bestand: { ET1: 100 } });
    expect(sollSekundenNettoAusDaten(d, [pos("ET1", 2)], 2)).toBe(2 * 5 * 60);
  });

  it("null wenn nichts beiträgt", () => {
    const d = daten({});
    expect(sollSekundenNettoAusDaten(d, [pos("ET1", 2)], 2)).toBeNull();
  });

  it("Lagerdeckung zählt Abpackzeit, Rest Vorgabezeit + Kinder", () => {
    // BG (Bestand 1, vz 10) → 2×ET1 (vz 5); Bedarf 3 BG, Packzeit 2 min
    // aus Lager: 1 × 120 s = 120
    // zu fertigen: 2 × 10 × 60 = 1200; Kinder: 4 ET1 × 5 × 60 = 1200 (ET1 ohne Bestand)
    const d = daten({
      kinder: { BG: [{ artikelnummer: "ET1", menge: 2 }] },
      bestand: { BG: 1 },
      vorgabezeit: { BG: 10, ET1: 5 },
    });
    expect(sollSekundenNettoAusDaten(d, [pos("BG", 3)], 2)).toBe(120 + 1200 + 1200);
  });

  it("Kind mit Lagerbestand zählt anteilig Abpackzeit", () => {
    // BG (vz 10, kein Bestand) → 1×ET1 (Bestand 2, vz 5); Bedarf 3
    // BG: 3 × 10 × 60 = 1800; ET1: 2 aus Lager × 120 + 1 × 5 × 60 = 240 + 300
    const d = daten({
      kinder: { BG: [{ artikelnummer: "ET1", menge: 1 }] },
      bestand: { ET1: 2 },
      vorgabezeit: { BG: 10, ET1: 5 },
    });
    expect(sollSekundenNettoAusDaten(d, [pos("BG", 3)], 2)).toBe(1800 + 240 + 300);
  });
});
