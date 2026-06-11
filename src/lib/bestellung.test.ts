import { describe, it, expect } from "vitest";
import { effektiverTermin, terminAmpel, statusNachWareneingang } from "./bestellung";
import { vorschlagsmenge, eoqAusLink } from "./bestellvorschlag";

// Mittwoch, 10.06.2026, 12:00 Berlin
const HEUTE = new Date("2026-06-10T10:00:00Z");

describe("effektiverTermin", () => {
  const kopf = { zugesagtTermin: new Date("2026-06-20") };
  it("Positions-Override geht vor Kopf-Termin", () => {
    expect(effektiverTermin({ zugesagtTermin: new Date("2026-06-15") }, kopf)).toEqual(
      new Date("2026-06-15")
    );
  });
  it("ohne Override gilt der Kopf, ohne beides null", () => {
    expect(effektiverTermin({ zugesagtTermin: null }, kopf)).toEqual(new Date("2026-06-20"));
    expect(effektiverTermin({ zugesagtTermin: null }, { zugesagtTermin: null })).toBeNull();
  });
});

describe("terminAmpel", () => {
  it("überschrittener Termin mit Restmenge → rot", () => {
    expect(terminAmpel(new Date("2026-06-09T00:00:00Z"), 5, HEUTE)).toBe("rot");
  });
  it("Termin in ≤ 3 Tagen → gelb, später → gruen", () => {
    expect(terminAmpel(new Date("2026-06-13T00:00:00Z"), 5, HEUTE)).toBe("gelb");
    expect(terminAmpel(new Date("2026-06-14T00:00:00Z"), 5, HEUTE)).toBe("gruen");
  });
  it("voll geliefert oder ohne Termin → gruen", () => {
    expect(terminAmpel(new Date("2026-01-01"), 0, HEUTE)).toBe("gruen");
    expect(terminAmpel(null, 5, HEUTE)).toBe("gruen");
  });
});

describe("statusNachWareneingang", () => {
  it("alle Positionen voll → abgeschlossen", () => {
    expect(
      statusNachWareneingang([
        { menge: 10, geliefert: 10 },
        { menge: 5, geliefert: 6 },
      ])
    ).toBe("abgeschlossen");
  });
  it("Rest offen → teilgeliefert", () => {
    expect(
      statusNachWareneingang([
        { menge: 10, geliefert: 10 },
        { menge: 5, geliefert: 2 },
      ])
    ).toBe("teilgeliefert");
  });
});

describe("vorschlagsmenge", () => {
  it("nimmt das Maximum aus EOQ, Mindestmenge und Lücke (aufgerundet)", () => {
    expect(vorschlagsmenge(50, 10, 24.3, 5)).toBe(40); // Lücke 40 > EOQ 24.3
    expect(vorschlagsmenge(50, 45, 24.3, 5)).toBe(25); // EOQ größer als Lücke 5
    expect(vorschlagsmenge(50, 48, null, 30)).toBe(30); // Mindestmenge dominiert
  });
});

describe("eoqAusLink", () => {
  it("berechnet EOQ aus Jahresbedarf, Bestellkosten und Preis×Zinssatz", () => {
    // D=1200, S=50, H=2*0.25=0.5 → sqrt(2*1200*50/0.5) ≈ 489.9
    const eoq = eoqAusLink({ jahresbedarf: 1200, bestellkosten: 50, lagerkostensatz: 0.25, einkaufspreis: 2 });
    expect(eoq).toBeCloseTo(489.9, 1);
  });
  it("null bei unvollständigen Parametern", () => {
    expect(eoqAusLink({ jahresbedarf: null, bestellkosten: 50, lagerkostensatz: 0.25, einkaufspreis: 2 })).toBeNull();
    expect(eoqAusLink({ jahresbedarf: 1200, bestellkosten: 0, lagerkostensatz: 0.25, einkaufspreis: 2 })).toBeNull();
  });
});
